import { IamPolicyEntity } from '../../entities/iam-policy.entity';
import { IamPolicyDto } from './dto/iam-policy.dto';

/**
 * Maps a persisted policy entity to a response DTO (parsed document).
 * @param entity - Policy entity with JSON document string
 * @returns Response DTO
 */
export function toIamPolicyDto(entity: IamPolicyEntity): IamPolicyDto {
  return {
    id: entity.id,
    name: entity.name,
    document: JSON.parse(entity.document) as Record<string, unknown>,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}
