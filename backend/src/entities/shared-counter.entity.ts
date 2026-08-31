import { Column, Entity, PrimaryColumn } from 'typeorm';
import { BIGINT_NUMBER_TRANSFORMER } from '../common/bigint-number.transformer';

/**
 * Persists shared lockout / throttle counter rows with TTL (`expires_at`).
 */
@Entity('shared_counters')
export class SharedCounterEntity {
  @PrimaryColumn({ type: 'varchar', length: 191 })
  key!: string;

  @Column({ type: 'integer' })
  failures!: number;

  @Column({
    name: 'first_at',
    type: 'bigint',
    transformer: BIGINT_NUMBER_TRANSFORMER,
  })
  firstAt!: number;

  @Column({
    name: 'locked_until',
    type: 'bigint',
    transformer: BIGINT_NUMBER_TRANSFORMER,
  })
  lockedUntil!: number;

  @Column({
    name: 'expires_at',
    type: 'bigint',
    transformer: BIGINT_NUMBER_TRANSFORMER,
  })
  expiresAt!: number;
}
