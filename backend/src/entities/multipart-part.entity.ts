import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BIGINT_NUMBER_TRANSFORMER } from '../common/bigint-number.transformer';

@Entity('multipart_parts')
@Index('IDX_multipart_part_unique', ['uploadRefId', 'partNumber'], {
  unique: true,
})
export class MultipartPartEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'upload_ref_id', type: 'integer' })
  uploadRefId!: number;

  @Column({ name: 'part_number', type: 'integer' })
  partNumber!: number;

  @Column({
    name: 'size',
    type: 'bigint',
    transformer: BIGINT_NUMBER_TRANSFORMER,
  })
  size!: number;

  @Column({ name: 'etag', type: 'varchar', length: 64 })
  etag!: string;

  @Column({ name: 'part_path', type: 'text' })
  partPath!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
