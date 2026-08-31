import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LifecycleRuleDto } from './lifecycle-rule.dto';

export class PutBucketLifecycleDto {
  @ApiProperty({ type: [LifecycleRuleDto] })
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => LifecycleRuleDto)
  rules!: LifecycleRuleDto[];
}
