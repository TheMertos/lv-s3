import { Readable } from 'stream';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { streamToFile } from './stream-to-file';

describe('streamToFile', () => {
  it('writes all bytes under the limit', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lv-s3-'));
    const dest = path.join(dir, 'out.bin');
    const r = await streamToFile(
      Readable.from([Buffer.from('hello')]),
      dest,
      100,
    );
    expect(r.bytesWritten).toBe(5);
    expect(await fs.readFile(dest, 'utf8')).toBe('hello');
  });

  it('rejects when over maxBytes', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lv-s3-'));
    const dest = path.join(dir, 'out.bin');
    await expect(
      streamToFile(Readable.from([Buffer.alloc(20)]), dest, 10),
    ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  });

  it('validates only a bounded prefix while writing the complete stream', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lv-s3-'));
    const dest = path.join(dir, 'out.bin');
    const validatePrefix = jest.fn();

    await streamToFile(
      Readable.from([Buffer.from('ab'), Buffer.from('cdefgh')]),
      dest,
      100,
      { prefixBytes: 4, validatePrefix },
    );

    expect(validatePrefix).toHaveBeenCalledWith(Buffer.from('abcd'));
    expect(await fs.readFile(dest, 'utf8')).toBe('abcdefgh');
  });
});
