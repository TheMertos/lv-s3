import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { AdminUserEntity } from './admin-user.entity';

@Entity('refresh_tokens')
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @ManyToOne(() => AdminUserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: AdminUserEntity;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ name: 'expires_at' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
