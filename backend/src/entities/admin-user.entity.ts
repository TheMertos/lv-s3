import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { RefreshTokenEntity } from './refresh-token.entity';

@Entity('admin_users')
export class AdminUserEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 36, unique: true })
  uuid: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  username: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 32, default: 'admin' })
  role: string;

  @Column({
    name: 'admin_s3_access_key',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  adminS3AccessKey: string | null;

  @Column({ name: 'admin_s3_secret_encrypted', type: 'text', nullable: true })
  adminS3SecretEncrypted: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => RefreshTokenEntity, (r) => r.user)
  refreshTokens: RefreshTokenEntity[];
}
