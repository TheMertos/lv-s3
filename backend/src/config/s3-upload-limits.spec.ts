import {
  s3MaxSinglePutBytes,
  s3MultipartMinPartBytes,
  s3MultipartMaxPartBytes,
} from './s3-upload-limits';

describe('s3-upload-limits', () => {
  const env = process.env;
  afterEach(() => {
    process.env = { ...env };
  });

  it('returns defaults when unset', () => {
    delete process.env.S3_MAX_SINGLE_PUT_BYTES;
    delete process.env.S3_MULTIPART_MIN_PART_BYTES;
    delete process.env.S3_MULTIPART_MAX_PART_BYTES;
    expect(s3MaxSinglePutBytes()).toBe(100 * 1024 * 1024);
    expect(s3MultipartMinPartBytes()).toBe(8 * 1024 * 1024);
    expect(s3MultipartMaxPartBytes()).toBe(64 * 1024 * 1024);
  });

  it('parses overrides', () => {
    process.env.S3_MAX_SINGLE_PUT_BYTES = '1048576';
    expect(s3MaxSinglePutBytes()).toBe(1048576);
  });
});
