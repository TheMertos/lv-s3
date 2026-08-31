import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BrowseFileDto {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  size!: number;

  @ApiProperty()
  lastModified!: string;
}

export class BrowseResponseDto {
  @ApiProperty({ type: [String] })
  prefixes!: string[];

  @ApiProperty({ type: [BrowseFileDto] })
  objects!: BrowseFileDto[];

  @ApiProperty()
  isTruncated!: boolean;

  @ApiPropertyOptional()
  nextContinuationToken?: string;
}
