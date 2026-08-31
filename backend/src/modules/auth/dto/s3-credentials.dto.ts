import { ApiProperty } from '@nestjs/swagger';

export class S3CredentialsDto {
  @ApiProperty()
  accessKey: string;

  @ApiProperty({ description: 'Same privilege as admin for S3 API' })
  secretKey: string;
}
