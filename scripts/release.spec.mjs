import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

import { bumpPatch, gitTagFromVersion, writePackageVersion, readPackageVersion } from './release.mjs';

test('bumpPatch increments the patch segment', () => {
  assert.equal(bumpPatch('0.1.0'), '0.1.1');
  assert.equal(bumpPatch('0.1.9'), '0.1.10');
  assert.equal(bumpPatch('1.2.3'), '1.2.4');
});

test('bumpPatch rejects non x.y.z versions', () => {
  assert.throws(() => bumpPatch('0.1'), /x\.y\.z/);
  assert.throws(() => bumpPatch('abc'), /x\.y\.z/);
  assert.throws(() => bumpPatch(''), /x\.y\.z/);
});

test('gitTagFromVersion prefixes v', () => {
  assert.equal(gitTagFromVersion('0.1.1'), 'v0.1.1');
});

test('writePackageVersion replaces only the version field', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lv-s3-release-'));
  const file = path.join(dir, 'package.json');
  fs.writeFileSync(file, '{\n  "name": "x",\n  "version": "0.1.0"\n}\n');
  writePackageVersion(file, '0.1.1');
  assert.equal(readPackageVersion(file), '0.1.1');
  assert.match(fs.readFileSync(file, 'utf8'), /"name": "x"/);
});
