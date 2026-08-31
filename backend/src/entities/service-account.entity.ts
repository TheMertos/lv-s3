import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/** S3 access keys; secret stored AES-GCM encrypted (SigV4 verification needs plaintext). */
@Entity('service_accounts')
export class ServiceAccountEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'access_key', type: 'varchar', length: 64, unique: true })
  accessKey: string;

  /** AES-256-GCM: iv:ciphertext:authTag (base64) */
  @Column({ name: 'secret_encrypted', type: 'text' })
  secretEncrypted: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  label: string | null;

  @Column({ type: 'boolean', default: false })
  disabled: boolean;

  /** JSON array of bucket names; null means all buckets allowed. */
  @Column({ name: 'allowed_buckets', type: 'text', nullable: true })
  allowedBuckets: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
