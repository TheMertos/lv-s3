import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BIGINT_NUMBER_TRANSFORMER } from '../common/bigint-number.transformer';

@Entity('multipart_uploads')
export class MultipartUploadEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'upload_id', type: 'varchar', length: 64, unique: true })
  uploadId!: string;

  @Column({ name: 'bucket', type: 'varchar', length: 255 })
  bucket!: string;

  @Column({ name: 'object_key', type: 'text' })
  objectKey!: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 24,
    default: 'in_progress',
  })
  status!: 'in_progress' | 'completed' | 'aborted';

  @Column({
    name: 'part_size',
    type: 'bigint',
    nullable: true,
    transformer: BIGINT_NUMBER_TRANSFORMER,
  })
  partSize!: number | null;

  @Column({
    name: 'total_size',
    type: 'bigint',
    nullable: true,
    transformer: BIGINT_NUMBER_TRANSFORMER,
  })
  totalSize!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
