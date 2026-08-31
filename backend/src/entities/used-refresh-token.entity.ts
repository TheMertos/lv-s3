import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * Stores hashes of consumed refresh tokens for reuse detection.
 */
@Entity('used_refresh_tokens')
export class UsedRefreshTokenEntity {
  @PrimaryColumn({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ name: 'user_id', type: 'integer' })
  userId!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
