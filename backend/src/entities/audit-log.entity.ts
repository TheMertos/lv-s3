import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Immutable audit trail for sensitive admin operations.
 */
@Entity('audit_logs')
export class AuditLogEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  action!: string;

  @Column({ name: 'actor_type', type: 'varchar', length: 16, default: 'admin' })
  actorType!: string;

  @Column({ name: 'actor_id', type: 'integer', nullable: true })
  actorId!: number | null;

  @Column({ name: 'actor_name', type: 'varchar', length: 255, nullable: true })
  actorName!: string | null;

  @Column({
    name: 'resource_type',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  resourceType!: string | null;

  @Column({ name: 'resource_id', type: 'varchar', length: 255, nullable: true })
  resourceId!: string | null;

  @Column({ type: 'text', nullable: true })
  metadata!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip!: string | null;

  @Column({
    name: 'correlation_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  correlationId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
