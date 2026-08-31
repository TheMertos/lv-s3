import { ApiProperty } from '@nestjs/swagger';

export class MultipartPartItemDto {
  @ApiProperty()
  partNumber!: number;

  @ApiProperty()
  size!: number;

  @ApiProperty()
  etag!: string;
}

export class ListPartsResponseDto {
  @ApiProperty()
  uploadId!: string;

  @ApiProperty()
  bucket!: string;

  @ApiProperty()
  key!: string;

  @ApiProperty({ type: [MultipartPartItemDto] })
  parts!: MultipartPartItemDto[];
}
