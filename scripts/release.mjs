/**
 * Patch-bump LV S3, commit all non-ignored working-tree changes, tag, and push.
 *
 * Usage: yarn release [--dry-run]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const PACKAGE_FILES = ['package.json', 'backend/package.json', 'frontend/package.json'];
const ALLOWED_BRANCHES = new Set(['main', 'master']);

/**
 * Increments the patch segment of a x.y.z version.
 * @param {string} version Current semver (exactly three numeric parts)
 * @returns {string} Next patch version
 */
export function bumpPatch(version) {
  const parts = String(version)
    .trim()
    .split('.')
    .map((p) => Number.parseInt(p, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error(`Expected x.y.z version, got: ${version}`);
  }
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

/**
 * Git tag name for a version.
 * @param {string} version Semver without prefix
 * @returns {string} Tag like v0.1.1
 */
export function gitTagFromVersion(version) {
  return `v${version}`;
}

/**
 * Reads the "version" field from a package.json file.
 * @param {string} filePath Absolute path to package.json
 * @returns {string} Version string
 */
export function readPackageVersion(filePath) {
  const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (typeof pkg.version !== 'string' || !pkg.version) {
    throw new Error(`Missing version in ${filePath}`);
  }
  return pkg.version;
}

/**
 * Replaces the version field in package.json without reformatting the rest of the file.
 * @param {string} filePath Absolute path to package.json
 * @param {string} version New version
 * @returns {void}
 */
export function writePackageVersion(filePath, version) {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (!/"version"\s*:\s*"[^"]*"/.test(raw)) {
    throw new Error(`No version field to replace in ${filePath}`);
  }
  const next = raw.replace(/"version"\s*:\s*"[^"]*"/, `"version": "${version}"`);
  fs.writeFileSync(filePath, next);
}

/**
 * Runs git in the repo root and returns stdout (trimmed).
 * @param {string[]} args Git arguments
 * @returns {string} stdout
 */
function git(args) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Current branch name, or empty when detached.
 * @returns {string}
 */
export function currentBranch() {
  try {
    const name = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    return name === 'HEAD' ? '' : name;
  } catch {
    return '';
  }
}

/**
 * True when a git tag already exists locally.
 * @param {string} tag Tag name
 * @returns {boolean}
 */
export function tagExists(tag) {
  try {
    git(['rev-parse', '-q', '--verify', `refs/tags/${tag}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Bumps package versions, commits the working tree, tags, and pushes origin.
 * @param {{ dryRun?: boolean }} [opts]
 * @returns {{ version: string, tag: string }}
 */
export function runRelease(opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const rootPkg = path.join(REPO_ROOT, 'package.json');
  const current = readPackageVersion(rootPkg);
  const version = bumpPatch(current);
  const tag = gitTagFromVersion(version);

  const branch = currentBranch();
  if (!ALLOWED_BRANCHES.has(branch)) {
    throw new Error(`Release only from main or master (current: ${branch || 'detached'})`);
  }
  if (tagExists(tag)) {
    throw new Error(`Tag ${tag} already exists`);
  }

  const versions = PACKAGE_FILES.map((rel) => readPackageVersion(path.join(REPO_ROOT, rel)));
  if (versions.some((v) => v !== current)) {
    throw new Error(
      `Package versions must match before release (root ${current}: ${PACKAGE_FILES.map((f, i) => `${f}=${versions[i]}`).join(', ')})`,
    );
  }

  if (dryRun) {
    return { version, tag };
  }

  for (const rel of PACKAGE_FILES) {
    writePackageVersion(path.join(REPO_ROOT, rel), version);
  }

  execFileSync('git', ['add', '-A'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  execFileSync('git', ['commit', '-m', `release: ${tag}`], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  execFileSync('git', ['tag', '-a', tag, '-m', tag], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  execFileSync('git', ['push', '-u', 'origin', 'HEAD'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  execFileSync('git', ['push', 'origin', tag], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });

  return { version, tag };
}

const thisFile = fileURLToPath(import.meta.url);
const invoked = process.argv[1] && path.resolve(process.argv[1]) === thisFile;

if (invoked) {
  try {
    const dryRun = process.argv.includes('--dry-run');
    const { version, tag } = runRelease({ dryRun });
    if (dryRun) {
      console.log(`Dry run: next ${tag} (${version})`);
    } else {
      console.log(`Released ${tag}. GitHub Actions will build Docker Hub images.`);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
