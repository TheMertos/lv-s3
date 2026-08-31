import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { SharedCounterEntity } from '../../entities/shared-counter.entity';
import type {
  SharedCounterRecord,
  SharedCounterStore,
} from './shared-counter-store';

/** Max mutate retries when a Postgres cold-key INSERT hits a unique violation. */
const MUTATE_MAX_RETRIES = 8;

/**
 * TypeORM-backed SharedCounterStore using the `shared_counters` table.
 */
@Injectable()
export class DbSharedCounterStore implements SharedCounterStore {
  /**
   * Chains mutates on non-Postgres drivers (SQLite) so concurrent callers do not
   * nest `BEGIN` on the single shared connection.
   */
  private sqliteMutateChain: Promise<unknown> = Promise.resolve();

  constructor(
    @InjectRepository(SharedCounterEntity)
    private readonly repo: Repository<SharedCounterEntity>,
  ) {}

  /**
   * Maps a DB row to a store record when still within TTL.
   * @param row - Entity row or null.
   * @param now - Current epoch ms.
   * @returns Record or null when missing / expired.
   */
  private toRecord(
    row: SharedCounterEntity | null,
    now: number,
  ): SharedCounterRecord | null {
    if (!row) return null;
    if (row.expiresAt < now) return null;
    return {
      failures: row.failures,
      firstAt: row.firstAt,
      lockedUntil: row.lockedUntil,
    };
  }

  /**
   * Whether the connection uses Postgres (supports pessimistic write locks).
   * @returns True when TypeORM driver type is `postgres`.
   */
  private isPostgres(): boolean {
    return this.repo.manager.connection.options.type === 'postgres';
  }

  /**
   * Detects a unique / primary-key conflict (Postgres `23505`, SQLite constraint).
   * Used to retry cold-key INSERTs that race on the same `key`.
   * @param err - Caught error from a mutate transaction.
   * @returns True when the error is a duplicate-key style failure.
   */
  private isUniqueViolation(err: unknown): boolean {
    if (!(err instanceof QueryFailedError)) return false;
    const driver = err.driverError as
      | { code?: string; errno?: number }
      | undefined;
    const code = driver?.code ?? (err as { code?: string }).code;
    if (code === '23505') return true; // Postgres unique_violation
    if (
      code === 'SQLITE_CONSTRAINT' ||
      code === 'SQLITE_CONSTRAINT_PRIMARYKEY'
    ) {
      return true;
    }
    const message = String(err.message ?? '');
    return /unique|duplicate key|PRIMARY KEY/i.test(message);
  }

  /**
   * Loads a row by key inside a transaction, optionally with a write lock.
   * @param manager - Transaction entity manager.
   * @param key - Logical counter key.
   * @returns Entity row or null.
   */
  private async loadForUpdate(
    manager: EntityManager,
    key: string,
  ): Promise<SharedCounterEntity | null> {
    const qb = manager
      .getRepository(SharedCounterEntity)
      .createQueryBuilder('c')
      .where('c.key = :key', { key });
    if (this.isPostgres()) {
      qb.setLock('pessimistic_write');
    }
    return qb.getOne();
  }

  /**
   * Reads a counter row; treats missing or expired rows as absent.
   * @param key - Logical counter key.
   * @returns Stored record, or `null` when missing / expired.
   */
  async get(key: string): Promise<SharedCounterRecord | null> {
    const row = await this.repo.findOne({ where: { key } });
    return this.toRecord(row, Date.now());
  }

  /**
   * Upserts a counter row and sets `expiresAt` to now + `ttlMs`.
   * @param key - Logical counter key.
   * @param value - Record fields to persist.
   * @param ttlMs - Time-to-live in milliseconds.
   */
  async set(
    key: string,
    value: SharedCounterRecord,
    ttlMs: number,
  ): Promise<void> {
    const expiresAt = Date.now() + ttlMs;
    await this.repo.save({
      key,
      failures: value.failures,
      firstAt: value.firstAt,
      lockedUntil: value.lockedUntil,
      expiresAt,
    });
  }

  /**
   * Removes the counter row for `key`.
   * @param key - Logical counter key.
   */
  async delete(key: string): Promise<void> {
    await this.repo.delete({ key });
  }

  /**
   * Atomically loads, transforms, and persists (or deletes) a counter row.
   * Uses a TypeORM transaction; Postgres takes a pessimistic write lock.
   *
   * Cold-key race (Postgres): `SELECT FOR UPDATE` does not serialize the first
   * INSERT when no row exists. Concurrent first writers can hit a unique /
   * primary-key violation. On that error the whole mutate transaction is
   * retried (reload with FOR UPDATE, re-apply `fn`) up to
   * {@link MUTATE_MAX_RETRIES} times so losers re-read the winner's row.
   *
   * SQLite serializes mutates on a process-local chain (single-connection driver
   * cannot nest concurrent transactions); the chain already prevents the
   * cold-key INSERT race within one process.
   * @param key - Logical counter key.
   * @param ttlMs - TTL for the persisted record when `fn` returns a value.
   * @param fn - Transform current record (null if missing/expired) → next, or null to delete.
   * @returns The record after mutate, or null if deleted / fn returned null.
   */
  async mutate(
    key: string,
    ttlMs: number,
    fn: (current: SharedCounterRecord | null) => SharedCounterRecord | null,
  ): Promise<SharedCounterRecord | null> {
    if (this.isPostgres()) {
      return this.mutateWithUniqueRetry(key, ttlMs, fn);
    }
    const run = this.sqliteMutateChain.then(
      () => this.mutateInTransaction(key, ttlMs, fn),
      () => this.mutateInTransaction(key, ttlMs, fn),
    );
    this.sqliteMutateChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * Runs mutate transactions, retrying on unique-violation (cold-key INSERT race).
   * @param key - Logical counter key.
   * @param ttlMs - TTL when persisting a value.
   * @param fn - Transform current → next, or null to delete.
   * @returns Record after mutate, or null if deleted.
   */
  private async mutateWithUniqueRetry(
    key: string,
    ttlMs: number,
    fn: (current: SharedCounterRecord | null) => SharedCounterRecord | null,
  ): Promise<SharedCounterRecord | null> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MUTATE_MAX_RETRIES; attempt++) {
      try {
        return await this.mutateInTransaction(key, ttlMs, fn);
      } catch (err) {
        lastError = err;
        if (
          !this.isUniqueViolation(err) ||
          attempt === MUTATE_MAX_RETRIES - 1
        ) {
          throw err;
        }
      }
    }
    throw lastError;
  }

  /**
   * Runs one mutate inside a TypeORM transaction (Postgres: row lock).
   * @param key - Logical counter key.
   * @param ttlMs - TTL when persisting a value.
   * @param fn - Transform current → next, or null to delete.
   * @returns Record after mutate, or null if deleted.
   */
  private async mutateInTransaction(
    key: string,
    ttlMs: number,
    fn: (current: SharedCounterRecord | null) => SharedCounterRecord | null,
  ): Promise<SharedCounterRecord | null> {
    return this.repo.manager.transaction(async (manager) => {
      const now = Date.now();
      const row = await this.loadForUpdate(manager, key);
      const current = this.toRecord(row, now);
      const next = fn(current);
      const repo = manager.getRepository(SharedCounterEntity);

      if (next === null) {
        if (row) {
          await repo.delete({ key });
        }
        return null;
      }

      await repo.save({
        key,
        failures: next.failures,
        firstAt: next.firstAt,
        lockedUntil: next.lockedUntil,
        expiresAt: now + ttlMs,
      });
      return next;
    });
  }
}
