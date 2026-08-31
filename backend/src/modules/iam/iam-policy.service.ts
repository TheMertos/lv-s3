import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { IamPolicyEntity } from '../../entities/iam-policy.entity';
import { ServiceAccountEntity } from '../../entities/service-account.entity';
import { ServiceAccountPolicyEntity } from '../../entities/service-account-policy.entity';
import { buildIamArn } from './iam-arn';
import { parseAndValidatePolicyDocument } from './iam-policy-document';
import { evaluateIamStatements } from './iam-policy-evaluator';
import type {
  IamAction,
  IamPolicyDocument,
  IamStatement,
} from './iam-policy.types';

/**
 * CRUD for IAM policies, attach/detach to service accounts, and S3 authorization.
 */
@Injectable()
export class IamPolicyService {
  constructor(
    @InjectRepository(IamPolicyEntity)
    private readonly policyRepo: Repository<IamPolicyEntity>,
    @InjectRepository(ServiceAccountPolicyEntity)
    private readonly joinRepo: Repository<ServiceAccountPolicyEntity>,
    @InjectRepository(ServiceAccountEntity)
    private readonly serviceAccountRepo: Repository<ServiceAccountEntity>,
  ) {}

  /**
   * Creates a named policy after validating the document JSON.
   * @param name - Unique policy name
   * @param document - Raw policy document object
   * @returns Persisted policy entity
   */
  async create(name: string, document: unknown): Promise<IamPolicyEntity> {
    const validated = parseAndValidatePolicyDocument(document);
    return this.policyRepo.save({
      name,
      document: JSON.stringify(validated),
    });
  }

  /**
   * Updates policy name and/or document.
   * @param id - Policy id
   * @param patch - Optional name and/or document
   * @returns Updated policy entity
   */
  async update(
    id: number,
    patch: { name?: string; document?: unknown },
  ): Promise<IamPolicyEntity> {
    const existing = await this.get(id);
    const next: Partial<IamPolicyEntity> = {};

    if (patch.name !== undefined) {
      next.name = patch.name;
    }
    if (patch.document !== undefined) {
      const validated = parseAndValidatePolicyDocument(patch.document);
      next.document = JSON.stringify(validated);
    }

    return this.policyRepo.save({ ...existing, ...next });
  }

  /**
   * Deletes a policy and its service-account join rows.
   * @param id - Policy id
   */
  async delete(id: number): Promise<void> {
    await this.get(id);
    await this.joinRepo.delete({ policyId: id });
    await this.policyRepo.delete({ id });
  }

  /**
   * Lists all policies ordered by name.
   * @returns All policy entities
   */
  async list(): Promise<IamPolicyEntity[]> {
    return this.policyRepo.find({ order: { name: 'ASC' } });
  }

  /**
   * Loads a policy by id.
   * @param id - Policy id
   * @returns Policy entity
   */
  async get(id: number): Promise<IamPolicyEntity> {
    const policy = await this.policyRepo.findOne({ where: { id } });
    if (!policy) {
      throw new NotFoundException('IAM policy not found');
    }
    return policy;
  }

  /**
   * Attaches a policy to a service account (idempotent).
   * @param policyId - Policy id
   * @param serviceAccountId - Service account id
   */
  async attach(policyId: number, serviceAccountId: number): Promise<void> {
    await this.get(policyId);
    await this.requireServiceAccount(serviceAccountId);

    const existing = await this.joinRepo.findOne({
      where: { policyId, serviceAccountId },
    });
    if (!existing) {
      await this.joinRepo.save({ policyId, serviceAccountId });
    }
  }

  /**
   * Detaches a policy from a service account (no-op when not attached).
   * @param policyId - Policy id
   * @param serviceAccountId - Service account id
   */
  async detach(policyId: number, serviceAccountId: number): Promise<void> {
    await this.joinRepo.delete({ policyId, serviceAccountId });
  }

  /**
   * Lists policies attached to a service account.
   * @param serviceAccountId - Service account id
   * @returns Attached policy entities
   */
  async listForServiceAccount(
    serviceAccountId: number,
  ): Promise<IamPolicyEntity[]> {
    const joins = await this.joinRepo.find({ where: { serviceAccountId } });
    if (joins.length === 0) {
      return [];
    }
    const policyIds = joins.map((j) => j.policyId);
    return this.policyRepo.find({
      where: { id: In(policyIds) },
      order: { name: 'ASC' },
    });
  }

  /**
   * Authorizes an S3 request for a service account.
   * @param input.serviceAccountId - SA id (from SigV4 resolve)
   * @param input.allowedBuckets - parsed allow-list (null = all)
   * @param input.action - concrete IAM action
   * @param input.bucket - bucket name
   * @param input.key - object key if applicable
   * @returns true if allowed
   */
  async authorize(input: {
    serviceAccountId: number;
    allowedBuckets: string[] | null;
    action: Exclude<IamAction, 's3:*'>;
    bucket: string;
    key?: string;
  }): Promise<boolean> {
    if (!this.passesBucketAllowList(input.allowedBuckets, input.bucket)) {
      return false;
    }

    const policies = await this.listForServiceAccount(input.serviceAccountId);
    if (policies.length === 0) {
      return true;
    }

    const statements = this.flattenStatements(policies);
    const resourceArn = buildIamArn(input.bucket, input.key);
    const result = evaluateIamStatements(statements, input.action, resourceArn);

    if (result === 'explicitDeny' || result === 'defaultDeny') {
      return false;
    }
    return true;
  }

  /**
   * Whether a service account may ListBucket on the given bucket (for ListBuckets filtering).
   * @param input.serviceAccountId - SA id
   * @param input.allowedBuckets - Parsed allow-list
   * @param input.bucket - Bucket name
   * @returns true if ListBucket is authorized
   */
  async canListBucket(input: {
    serviceAccountId: number;
    allowedBuckets: string[] | null;
    bucket: string;
  }): Promise<boolean> {
    return this.authorize({
      ...input,
      action: 's3:ListBucket',
    });
  }

  /**
   * Returns true when the bucket passes the SA allow-list (null = all buckets).
   * @param allowedBuckets - Parsed allow-list from service account
   * @param bucket - Request bucket name
   */
  private passesBucketAllowList(
    allowedBuckets: string[] | null,
    bucket: string,
  ): boolean {
    if (allowedBuckets === null) {
      return true;
    }
    if (allowedBuckets.length === 0) {
      return false;
    }
    return allowedBuckets.includes(bucket);
  }

  /**
   * Flattens Statement arrays from stored policy documents.
   * @param policies - Attached policy entities
   * @returns Combined statement list
   */
  private flattenStatements(policies: IamPolicyEntity[]): IamStatement[] {
    return policies.flatMap((policy) => {
      const document = JSON.parse(policy.document) as IamPolicyDocument;
      return document.Statement;
    });
  }

  /**
   * Loads a service account or throws NotFoundException.
   * @param serviceAccountId - Service account id
   */
  private async requireServiceAccount(
    serviceAccountId: number,
  ): Promise<ServiceAccountEntity> {
    const account = await this.serviceAccountRepo.findOne({
      where: { id: serviceAccountId },
    });
    if (!account) {
      throw new NotFoundException('Service account not found');
    }
    return account;
  }
}
