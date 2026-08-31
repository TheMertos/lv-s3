import { BadRequestException } from '@nestjs/common';
import {
  assertAdminUploadAllowed,
  detectMimeFromBuffer,
} from './upload-validation';

describe('upload-validation', () => {
  it('detects PNG from magic bytes', () => {
    const buf = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);
    expect(detectMimeFromBuffer(buf)?.mime).toBe('image/png');
  });

  it('rejects PE executable content', () => {
    const buf = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
    expect(() => assertAdminUploadAllowed(buf)).toThrow(BadRequestException);
  });

  it('rejects mime mismatch when client claims image/png for text', () => {
    const buf = Buffer.from('plain text file', 'utf8');
    expect(() => assertAdminUploadAllowed(buf, 'image/png')).toThrow(
      BadRequestException,
    );
  });

  it('allows plain text with matching mime', () => {
    const buf = Buffer.from('hello world', 'utf8');
    const detected = assertAdminUploadAllowed(buf, 'text/plain');
    expect(detected.mime).toBe('text/plain');
  });

  it('allows unknown binary as octet-stream when not dangerous', () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    const detected = assertAdminUploadAllowed(buf);
    expect(detected.mime).toBe('application/octet-stream');
  });
});
