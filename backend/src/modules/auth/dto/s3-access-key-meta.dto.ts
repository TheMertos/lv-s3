import { ApiProperty } from '@nestjs/swagger';

/** Public-safe: Access Key ID only (no secret). Null when not yet generated. */
export class S3AccessKeyMetaDto {
  @ApiProperty({
    description:
      'S3 Access Key ID for this admin (lvadmin…), null until generated',
    nullable: true,
  })
  accessKey!: string | null;
}
