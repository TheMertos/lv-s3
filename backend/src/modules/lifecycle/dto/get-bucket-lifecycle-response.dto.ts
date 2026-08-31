import { ApiProperty } from '@nestjs/swagger';
import { LifecycleRuleDto } from './lifecycle-rule.dto';

export class GetBucketLifecycleResponseDto {
  @ApiProperty()
  bucket!: string;

  @ApiProperty({ type: [LifecycleRuleDto] })
  rules!: LifecycleRuleDto[];
}
