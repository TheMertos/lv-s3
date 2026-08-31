import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from '../../entities/audit-log.entity';
import { getCorrelationId } from '../../common/correlation-context';
import { AuditQueryDto } from './dto/audit-query.dto';
import { AuditListResponseDto } from './dto/audit-list-response.dto';
import { AuditLogItemDto } from './dto/audit-log-item.dto';

export type AuditRecordInput = {
  action: string;
  actorType?: string;
  actorId?: number | null;
  actorName?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  correlationId?: string | null;
};

/**
 * Persists immutable audit events for sensitive admin actions.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repo: Repository<AuditLogEntity>,
  ) {}

  /**
   * Lists audit log entries with pagination and optional filters.
   */
  async list(query: AuditQueryDto): Promise<AuditListResponseDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const qb = this.repo
      .createQueryBuilder('a')
      .orderBy('a.created_at', 'DESC');

    if (query.action) {
      qb.andWhere('a.action = :action', { action: query.action });
    }
    if (query.actorName) {
      qb.andWhere('a.actor_name LIKE :actorName', {
        actorName: `%${query.actorName}%`,
      });
    }
    if (query.from) {
      qb.andWhere('a.created_at >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('a.created_at <= :to', { to: query.to });
    }

    const total = await qb.getCount();
    const rows = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    return {
      items: rows.map((row) => this.toItemDto(row)),
      page,
      pageSize,
      total,
    };
  }

  /**
   * Maps a persisted audit row to a response DTO.
   */
  private toItemDto(row: AuditLogEntity): AuditLogItemDto {
    let metadata: Record<string, unknown> | null = null;
    if (row.metadata) {
      try {
        metadata = JSON.parse(row.metadata) as Record<string, unknown>;
      } catch {
        metadata = null;
      }
    }
    return {
      id: row.id,
      action: row.action,
      actorType: row.actorType,
      actorId: row.actorId,
      actorName: row.actorName,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      metadata,
      ip: row.ip,
      correlationId: row.correlationId,
      createdAt: row.createdAt,
    };
  }

  /**
   * Records an audit event; failures are logged but do not break the request.
   */
  async record(input: AuditRecordInput): Promise<void> {
    try {
      await this.repo.save({
        action: input.action,
        actorType: input.actorType ?? 'admin',
        actorId: input.actorId ?? null,
        actorName: input.actorName ?? null,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        ip: input.ip ?? null,
        correlationId: input.correlationId ?? getCorrelationId() ?? null,
      });
    } catch (err) {
      this.logger.error(
        `Failed to write audit log action=${input.action}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
