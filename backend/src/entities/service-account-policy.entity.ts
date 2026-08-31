import { Entity, PrimaryColumn } from 'typeorm';

/**
 * N:M join between service accounts and IAM policies.
 * Orphan rows are cleaned in the service layer on SA/policy delete (no DB FKs).
 */
@Entity('service_account_policies')
export class ServiceAccountPolicyEntity {
  @PrimaryColumn({ name: 'service_account_id', type: 'integer' })
  serviceAccountId!: number;

  @PrimaryColumn({ name: 'policy_id', type: 'integer' })
  policyId!: number;
}
