import { ApiProperty } from '@nestjs/swagger';

export class BucketItemDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  publicRead: boolean;

  @ApiProperty({
    description:
      'Object bytes stored sealed on disk; immutable; public read is disallowed.',
  })
  encryptAtRest: boolean;
}
