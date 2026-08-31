import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Named IAM policy document stored as JSON text for service-account authorization.
 */
@Entity('iam_policies')
export class IamPolicyEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 128, unique: true })
  name!: string;

  /** JSON string of a validated IamPolicyDocument. */
  @Column({ type: 'text' })
  document!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
