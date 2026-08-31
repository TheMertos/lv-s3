import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { ServiceAccountEntity } from '../../entities/service-account.entity';
import { ServiceAccountPolicyEntity } from '../../entities/service-account-policy.entity';
import { encryptSecret } from '../../common/crypto-secret';
import { ServiceAccountCreatedDto } from './dto/service-account-created.dto';
import { ServiceAccountListItemDto } from './dto/service-account-list-item.dto';

/**
 * Creates and lists S3 service accounts; secrets encrypted at rest.
 */
@Injectable()
export class ServiceAccountsService {
  constructor(
    @InjectRepository(ServiceAccountEntity)
    private readonly repo: Repository<ServiceAccountEntity>,
    @InjectRepository(ServiceAccountPolicyEntity)
    private readonly joinRepo: Repository<ServiceAccountPolicyEntity>,
    private readonly config: ConfigService,
  ) {}

  /**
   * Generates access key + secret, persists encrypted secret.
   */
  async create(
    label?: string | null,
    allowedBuckets?: string[] | null,
  ): Promise<ServiceAccountCreatedDto> {
    const master = this.config.getOrThrow<string>('MASTER_ENCRYPTION_KEY');
    const accessKey = 'lv' + crypto.randomBytes(10).toString('hex');
    const secretKey = crypto
      .randomBytes(20)
      .toString('base64')
      .replace(/\+/g, 'x')
      .replace(/\//g, 'y');
    const secretEncrypted = encryptSecret(master, secretKey);
    const normalizedBuckets = this.normalizeAllowedBuckets(allowedBuckets);
    await this.repo.save({
      accessKey,
      secretEncrypted,
      label: label ?? null,
      disabled: false,
      allowedBuckets:
        normalizedBuckets === null ? null : JSON.stringify(normalizedBuckets),
    });
    return {
      accessKey,
      secretKey,
      label: label ?? null,
      allowedBuckets: normalizedBuckets,
    };
  }

  /**
   * Lists accounts without secrets.
   */
  async list(): Promise<ServiceAccountListItemDto[]> {
    const rows = await this.repo.find({ order: { createdAt: 'DESC' } });
    return rows.map((r) => ({
      id: r.id,
      accessKey: r.accessKey,
      label: r.label,
      disabled: r.disabled,
      allowedBuckets: this.parseAllowedBuckets(r.allowedBuckets),
      createdAt: r.createdAt,
    }));
  }

  async disable(id: number): Promise<void> {
    await this.repo.update({ id }, { disabled: true });
  }

  /**
   * Deletes a service account and its IAM policy join rows.
   * @param id - Service account id
   */
  async delete(id: number): Promise<void> {
    await this.joinRepo.delete({ serviceAccountId: id });
    await this.repo.delete({ id });
  }

  /**
   * Normalizes optional bucket allow-list input.
   */
  private normalizeAllowedBuckets(buckets?: string[] | null): string[] | null {
    if (buckets === undefined || buckets === null) return null;
    return [...new Set(buckets.map((b) => b.trim()).filter(Boolean))];
  }

  /**
   * Parses stored JSON bucket allow-list.
   */
  private parseAllowedBuckets(raw: string | null): string[] | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return null;
      return parsed.filter((v): v is string => typeof v === 'string');
    } catch {
      return null;
    }
  }
}
