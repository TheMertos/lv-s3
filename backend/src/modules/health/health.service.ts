import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageService } from '../storage/storage.service';

type ReadinessCheck = { ok: boolean; error?: string };

/**
 * Performs dependency readiness checks for the admin application.
 */
@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Checks database connectivity and storage root writability.
   */
  async readiness(): Promise<{
    ok: boolean;
    checks: { database: ReadinessCheck; storage: ReadinessCheck };
  }> {
    const database = await this.checkDatabase();
    const storage = await this.checkStorage();
    return {
      ok: database.ok && storage.ok,
      checks: { database, storage },
    };
  }

  /**
   * Runs a simple query against the database.
   */
  private async checkDatabase(): Promise<ReadinessCheck> {
    try {
      await this.dataSource.query('SELECT 1');
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Writes and deletes a probe file in the storage root.
   */
  private async checkStorage(): Promise<ReadinessCheck> {
    const root =
      this.config.get<string>('STORAGE_ROOT') ??
      path.join(process.cwd(), 'data', 'storage');
    const probe = path.join(root, '.lv-s3-readiness-probe');
    try {
      await fs.mkdir(root, { recursive: true });
      await fs.writeFile(probe, 'ok', 'utf8');
      await fs.unlink(probe);
      return { ok: true };
    } catch (err) {
      try {
        await fs.unlink(probe);
      } catch {
        /* ignore cleanup failure */
      }
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
