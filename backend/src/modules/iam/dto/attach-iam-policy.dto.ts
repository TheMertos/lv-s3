import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';

/**
 * Request body for attaching or detaching a policy to/from a service account.
 */
export class AttachIamPolicyDto {
  @ApiProperty({ description: 'Target service account id' })
  @IsInt()
  @IsPositive()
  serviceAccountId!: number;
}
