import { BadRequestException } from '@nestjs/common';

export type DetectedMime = {
  mime: string;
  ext?: string;
};

type SignatureRule = {
  mime: string;
  ext?: string;
  match: (buf: Buffer) => boolean;
};

/** Maximum prefix retained while validating streamed upload signatures. */
export const UPLOAD_VALIDATION_PREFIX_BYTES = 4096;

const DANGEROUS: SignatureRule[] = [
  {
    mime: 'application/x-msdownload',
    ext: 'exe',
    match: (b) => b.length >= 2 && b[0] === 0x4d && b[1] === 0x5a,
  },
  {
    mime: 'application/x-elf',
    ext: 'elf',
    match: (b) => b.length >= 4 && b.subarray(0, 4).toString() === '\x7fELF',
  },
  {
    mime: 'application/x-mach-binary',
    match: (b) =>
      b.length >= 4 &&
      (b.subarray(0, 4).equals(Buffer.from([0xfe, 0xed, 0xfa, 0xce])) ||
        b.subarray(0, 4).equals(Buffer.from([0xce, 0xfa, 0xed, 0xfe])) ||
        b.subarray(0, 4).equals(Buffer.from([0xfe, 0xed, 0xfa, 0xcf])) ||
        b.subarray(0, 4).equals(Buffer.from([0xcf, 0xfa, 0xed, 0xfe]))),
  },
  {
    mime: 'application/java-archive',
    ext: 'class',
    match: (b) =>
      b.length >= 4 &&
      b[0] === 0xca &&
      b[1] === 0xfe &&
      b[2] === 0xba &&
      b[3] === 0xbe,
  },
];

const ALLOWED: SignatureRule[] = [
  {
    mime: 'image/png',
    ext: 'png',
    match: (b) =>
      b.length >= 8 &&
      b
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/jpeg',
    ext: 'jpg',
    match: (b) =>
      b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/gif',
    ext: 'gif',
    match: (b) =>
      b.length >= 6 &&
      (b.subarray(0, 6).toString() === 'GIF87a' ||
        b.subarray(0, 6).toString() === 'GIF89a'),
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    match: (b) =>
      b.length >= 12 &&
      b.subarray(0, 4).toString() === 'RIFF' &&
      b.subarray(8, 12).toString() === 'WEBP',
  },
  {
    mime: 'application/pdf',
    ext: 'pdf',
    match: (b) => b.length >= 5 && b.subarray(0, 5).toString() === '%PDF-',
  },
  {
    mime: 'application/zip',
    ext: 'zip',
    match: (b) =>
      b.length >= 4 &&
      b[0] === 0x50 &&
      b[1] === 0x4b &&
      (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07) &&
      (b[3] === 0x04 || b[3] === 0x06 || b[3] === 0x08),
  },
  {
    mime: 'application/gzip',
    ext: 'gz',
    match: (b) => b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b,
  },
  {
    mime: 'application/json',
    ext: 'json',
    match: (b) => isLikelyJson(b),
  },
  {
    mime: 'text/plain',
    ext: 'txt',
    match: (b) => isLikelyText(b),
  },
  {
    mime: 'video/mp4',
    ext: 'mp4',
    match: (b) =>
      b.length >= 12 &&
      b.subarray(4, 8).toString() === 'ftyp' &&
      ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', 'M4A '].some((brand) =>
        b.subarray(8, 12).toString().startsWith(brand.slice(0, 4)),
      ),
  },
  {
    mime: 'audio/mpeg',
    ext: 'mp3',
    match: (b) =>
      (b.length >= 3 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) ||
      (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  },
];

/**
 * Detects MIME type from file magic bytes (no client header trust).
 */
export function detectMimeFromBuffer(buf: Buffer): DetectedMime | null {
  if (!buf.length) return null;
  for (const rule of DANGEROUS) {
    if (rule.match(buf)) return { mime: rule.mime, ext: rule.ext };
  }
  for (const rule of ALLOWED) {
    if (rule.match(buf)) return { mime: rule.mime, ext: rule.ext };
  }
  return { mime: 'application/octet-stream' };
}

/**
 * Validates upload content or a bounded content prefix; rejects executables and MIME mismatches.
 * @param buf - Complete upload bytes or the initial streamed prefix.
 * @param clientMime - Optional client-declared MIME type.
 * @returns MIME type detected from the available bytes.
 */
export function assertAdminUploadAllowed(
  buf: Buffer,
  clientMime?: string | null,
): DetectedMime {
  if (!buf.length) {
    throw new BadRequestException({
      code: 'UPLOAD_EMPTY',
      message: 'Upload file is empty',
    });
  }

  const detected = detectMimeFromBuffer(buf);
  if (!detected) {
    throw new BadRequestException({
      code: 'UPLOAD_REJECTED',
      message: 'Upload could not be validated',
    });
  }

  if (DANGEROUS.some((r) => r.mime === detected.mime)) {
    throw new BadRequestException({
      code: 'UPLOAD_REJECTED',
      message: 'Executable or unsafe file type is not allowed',
      details: { detectedMime: detected.mime },
    });
  }

  const normalizedClient = (clientMime ?? '')
    .split(';')[0]
    ?.trim()
    .toLowerCase();
  if (
    normalizedClient &&
    normalizedClient !== 'application/octet-stream' &&
    detected.mime !== 'application/octet-stream' &&
    normalizedClient !== detected.mime
  ) {
    throw new BadRequestException({
      code: 'UPLOAD_MIME_MISMATCH',
      message: 'File content does not match the declared content type',
      details: { clientMime: normalizedClient, detectedMime: detected.mime },
    });
  }

  return detected;
}

/** Shared bounded-prefix policy for streamed object uploads. */
export const STREAM_UPLOAD_VALIDATION = {
  prefixBytes: UPLOAD_VALIDATION_PREFIX_BYTES,
  validatePrefix: assertAdminUploadAllowed,
};

function isLikelyText(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 512));
  if (sample.includes(0)) return false;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13) continue;
    if (byte < 32 || byte > 126) return false;
  }
  return true;
}

function isLikelyJson(buf: Buffer): boolean {
  const trimmed = buf
    .subarray(0, Math.min(buf.length, 4096))
    .toString('utf8')
    .trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}
