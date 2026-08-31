import { mapS3RequestToIam } from './iam-s3-action';

describe('mapS3RequestToIam', () => {
  it('returns null for ListBuckets (GET / with no bucket)', () => {
    expect(mapS3RequestToIam({ method: 'GET', query: {} })).toBeNull();
  });

  it('maps GET/HEAD object to GetObject', () => {
    expect(
      mapS3RequestToIam({
        method: 'GET',
        bucket: 'photos',
        key: 'a.jpg',
        query: {},
      }),
    ).toEqual({ action: 's3:GetObject', bucket: 'photos', key: 'a.jpg' });

    expect(
      mapS3RequestToIam({
        method: 'HEAD',
        bucket: 'photos',
        key: 'a.jpg',
        query: {},
      }),
    ).toEqual({ action: 's3:GetObject', bucket: 'photos', key: 'a.jpg' });
  });

  it('maps PUT object (no uploadId) to PutObject', () => {
    expect(
      mapS3RequestToIam({
        method: 'PUT',
        bucket: 'photos',
        key: 'a.jpg',
        query: {},
      }),
    ).toEqual({ action: 's3:PutObject', bucket: 'photos', key: 'a.jpg' });
  });

  it('maps DELETE object to DeleteObject', () => {
    expect(
      mapS3RequestToIam({
        method: 'DELETE',
        bucket: 'photos',
        key: 'a.jpg',
        query: {},
      }),
    ).toEqual({ action: 's3:DeleteObject', bucket: 'photos', key: 'a.jpg' });
  });

  it('maps ListObjectsV2 to ListBucket', () => {
    expect(
      mapS3RequestToIam({
        method: 'GET',
        bucket: 'photos',
        query: { 'list-type': '2' },
      }),
    ).toEqual({ action: 's3:ListBucket', bucket: 'photos' });
  });

  it('maps CreateBucket to PutObject without key', () => {
    expect(
      mapS3RequestToIam({
        method: 'PUT',
        bucket: 'photos',
        query: {},
      }),
    ).toEqual({ action: 's3:PutObject', bucket: 'photos' });
  });

  it('maps DeleteBucket to DeleteObject without key', () => {
    expect(
      mapS3RequestToIam({
        method: 'DELETE',
        bucket: 'photos',
        query: {},
      }),
    ).toEqual({ action: 's3:DeleteObject', bucket: 'photos' });
  });

  it('maps HeadBucket to ListBucket', () => {
    expect(
      mapS3RequestToIam({
        method: 'HEAD',
        bucket: 'photos',
        query: {},
      }),
    ).toEqual({ action: 's3:ListBucket', bucket: 'photos' });
  });

  it('maps multipart initiate / part / complete to PutObject', () => {
    expect(
      mapS3RequestToIam({
        method: 'POST',
        bucket: 'photos',
        key: 'big.bin',
        query: { uploads: '' },
      }),
    ).toEqual({ action: 's3:PutObject', bucket: 'photos', key: 'big.bin' });

    expect(
      mapS3RequestToIam({
        method: 'PUT',
        bucket: 'photos',
        key: 'big.bin',
        query: { uploadId: 'u1', partNumber: '1' },
      }),
    ).toEqual({ action: 's3:PutObject', bucket: 'photos', key: 'big.bin' });

    expect(
      mapS3RequestToIam({
        method: 'POST',
        bucket: 'photos',
        key: 'big.bin',
        query: { uploadId: 'u1' },
      }),
    ).toEqual({ action: 's3:PutObject', bucket: 'photos', key: 'big.bin' });
  });

  it('maps AbortMultipartUpload to DeleteObject', () => {
    expect(
      mapS3RequestToIam({
        method: 'DELETE',
        bucket: 'photos',
        key: 'big.bin',
        query: { uploadId: 'u1' },
      }),
    ).toEqual({ action: 's3:DeleteObject', bucket: 'photos', key: 'big.bin' });
  });
});
