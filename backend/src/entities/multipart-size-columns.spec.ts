import { getMetadataArgsStorage, ValueTransformer } from 'typeorm';
import { MultipartPartEntity } from './multipart-part.entity';
import { MultipartUploadEntity } from './multipart-upload.entity';

/**
 * Returns the configured TypeORM column type for an entity property.
 * @param target - Entity class containing the property.
 * @param propertyName - TypeScript property mapped to the database column.
 * @returns Configured database type.
 */
function columnType(
  target: typeof MultipartUploadEntity | typeof MultipartPartEntity,
  propertyName: string,
): unknown {
  return getMetadataArgsStorage().columns.find(
    (column) =>
      column.target === target && column.propertyName === propertyName,
  )?.options.type;
}

/**
 * Returns the configured transformer for an entity property.
 * @param target - Entity class containing the property.
 * @param propertyName - TypeScript property mapped to the database column.
 * @returns Configured value transformer.
 */
function columnTransformer(
  target: typeof MultipartUploadEntity | typeof MultipartPartEntity,
  propertyName: string,
): ValueTransformer | undefined {
  return getMetadataArgsStorage().columns.find(
    (column) =>
      column.target === target && column.propertyName === propertyName,
  )?.options.transformer as ValueTransformer | undefined;
}

describe('multipart size columns', () => {
  it('uses bigint for all byte counts that can exceed 2 GiB', () => {
    expect(columnType(MultipartUploadEntity, 'partSize')).toBe('bigint');
    expect(columnType(MultipartUploadEntity, 'totalSize')).toBe('bigint');
    expect(columnType(MultipartPartEntity, 'size')).toBe('bigint');
    expect(
      columnTransformer(MultipartUploadEntity, 'totalSize')?.from(
        '53687091200',
      ),
    ).toBe(53687091200);
  });
});
