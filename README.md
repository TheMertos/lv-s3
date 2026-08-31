# LV S3

<p align="center">
  <img src="frontend/public/lv-s3-logo.png" alt="LV S3" width="220" />
</p>

<p align="center">
  <strong>Self-hosted object storage</strong> with an S3-compatible API and a dark admin console.<br />
  Path-style SigV4, service accounts, optional encrypt-at-rest — one Docker image.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-00e5ff?style=flat-square" /></a>
  <img alt="S3 API" src="https://img.shields.io/badge/S3-path--style%20SigV4-0080a8?style=flat-square" />
  <img alt="Single instance" src="https://img.shields.io/badge/deploy-single%20instance-035071?style=flat-square" />
</p>

## Why LV S3

Amazon S3 semantics on a single host: buckets, multipart uploads, IAM-style policies for service accounts, and a web console — without operating a full cloud stack.

| Service | Port | Role |
|---------|------|------|
| **S3 API** | 9000 | AWS SigV4, path-style `/{bucket}/{key}`, native multipart |
| **Admin + UI** | 9001 | JWT REST API and React console (same origin in Docker) |

Object bytes live on disk (`STORAGE_ROOT`). Control-plane metadata is **SQLite** by default or **PostgreSQL** via `DATABASE_URL`.

## Features

- Object browser (upload, download, folders, drag-and-drop)
- Per-bucket **encrypt-at-rest** (immutable after create) and **public-read** GET/HEAD
- Service accounts, optional bucket scope, statement-level **IAM policies**
- Lifecycle rules + background runner, audit log, optional malware scan (ClamAV / webhook)
- Streaming PUT / multipart (no full-object RAM buffer)

## Quick start (Docker)

```bash
cp .env.docker.example .env
# edit .env — set ADMIN_BOOTSTRAP_PASSWORD, JWT_ACCESS_SECRET, MASTER_ENCRYPTION_KEY
docker compose up -d --build
```

Or pull a published image:

```bash
docker pull TheMertos/lv-s3:latest
docker tag TheMertos/lv-s3:latest lv-s3:latest
docker compose up -d
```

- Console: [http://localhost:9001](http://localhost:9001)
- S3 endpoint: `http://localhost:9000` (**path-style required**)

## Docker Compose and environment

Two files live at the **repo root** (same directory):

| File | Role |
|------|------|
| `docker-compose.yml` | Services, ports, volume `./lv_s3_data`, optional Postgres/Redis/ClamAV |
| `.env` | Secrets and settings. Copy from `.env.docker.example`. **Never commit `.env`.** |

On another host, copy both files together. Compose interpolates `${…}` from `.env` in the YAML, then injects the same file into the `api` container (`env_file: .env`). Keys under `services.api.environment` **override** the file (paths inside the container, `NODE_ENV=production`, empty `S3_ROOT_*`).

Do **not** copy `backend/.env.example` for Docker. That file is for local `yarn dev` and includes `S3_ROOT_*`, which production rejects.

Put `./lv_s3_data` (and Postgres data, if used) on encrypted disks. Compose does not encrypt volumes.

### Enable Postgres / Redis / ClamAV

SQLite is the default (`DATABASE_PATH=/data/app.db` in the data volume). Optional services use Compose **profiles**. Uncomment the matching `environment` (and `depends_on`) lines on `api` in `docker-compose.yml`, then:

```bash
docker compose --profile postgres up -d
# docker compose --profile redis up -d
# docker compose --profile clamav up -d
```

When `DATABASE_URL` is set, `DATABASE_PATH` is ignored.

### `.env` — required (Docker)

| Variable | Purpose |
|----------|---------|
| `JWT_ACCESS_SECRET` | Signs admin JWT access tokens. Production: at least 32 characters, not the example value. |
| `MASTER_ENCRYPTION_KEY` | Derives service-account secret encryption and per-bucket encrypt-at-rest keys. Production: at least 32 characters; keep backups **separate** from object data. |
| `ADMIN_BOOTSTRAP_PASSWORD` | Password for the first admin user (created on an empty database). Must be strong in production. |

### `.env` — common optional

| Variable | Default | Purpose |
|----------|---------|---------|
| `ADMIN_BOOTSTRAP_USERNAME` | `admin` | Username for that first admin. |
| `BROWSER_REDIRECT_URL` | `http://localhost:9001` | If a browser hits the S3 port with `Accept: text/html`, redirect here instead of XML. Use your public console URL in production. |
| `CORS_ADMIN_ORIGIN` | `http://localhost:9001` | Allowed Origin for the admin API (console). |
| `CORS_S3_ORIGIN` | `http://localhost:3000` | Allowed Origin for browser calls to the S3 API. |
| `LIFECYCLE_RUNNER_ENABLED` | `true` | Background expiry of objects and stale multipart uploads. |
| `LIFECYCLE_RUNNER_INTERVAL_MS` | `60000` | How often the runner ticks. |
| `TRUST_PROXY` | unset | Set `1` (or hop count) behind a reverse proxy so client IP / lockout use `X-Forwarded-For`. |
| `S3_PUBLISH_PORT` | `9000` | Host port mapped to S3. |
| `ADMIN_PUBLISH_PORT` | `9001` | Host port mapped to admin UI + API. |
| `LV_S3_IMAGE_TAG` | `latest` | Image tag for `lv-s3:…` in Compose. |

### Application (also used in `backend/.env` for local dev)

Compose already sets `STORAGE_ROOT`, `DATABASE_PATH`, `ADMIN_PORT`, `S3_PORT`, and `TYPEORM_SYNC=false` inside the container. For `yarn dev`, set them in `backend/.env`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `ADMIN_PORT` / `S3_PORT` | `9001` / `9000` | Listen ports inside the process. |
| `STORAGE_ROOT` | `./data/storage` | Object bytes on disk. |
| `DATABASE_PATH` | `./data/app.db` | SQLite file when `DATABASE_URL` is unset. |
| `DATABASE_URL` | unset | Postgres URL; overrides SQLite. |
| `TYPEORM_SYNC` | `true` in the backend example; **`false` in Docker** | Schema sync. Migrations always run on startup; leave sync off in production. |
| `S3_ROOT_ACCESS_KEY` / `S3_ROOT_SECRET_KEY` | dev example only | SigV4 keys for local S3. **Forbidden when `NODE_ENV=production`.** Use admin S3 keys or service accounts. |
| `ADMIN_SWAGGER` | off in production | Set `true` to mount Swagger on the admin app. |
| `S3_SIGV4_MAX_SKEW_SEC` | `900` | Allowed clock skew for SigV4 timestamps. |
| `S3_PRESIGN_MAX_EXPIRES_SEC` | `604800` | Max presigned URL lifetime (capped at 7 days). |
| `S3_THROTTLE_LIMIT` / `S3_THROTTLE_TTL_MS` | `300` / `60000` | S3 API rate limit per IP. |
| `ADMIN_THROTTLE_LIMIT` / `ADMIN_THROTTLE_TTL_MS` | `120` / `60000` | Admin API rate limit per IP. |
| `ADMIN_LOGIN_MAX_ATTEMPTS` | `5` | Failed logins before lockout. |
| `ADMIN_LOGIN_LOCKOUT_MINUTES` | `15` | Lockout duration. |
| `ADMIN_LOGIN_WINDOW_MINUTES` | `15` | Window that counts toward lockout. |
| `S3_MAX_SINGLE_PUT_BYTES` | `104857600` (100 MiB) | Max non-multipart PUT. Larger objects need multipart. |
| `S3_MULTIPART_MIN_PART_BYTES` / `S3_MULTIPART_MAX_PART_BYTES` | 8 MiB / 64 MiB | Multipart part size bounds. |
| `REDIS_URL` | unset | Optional Redis for shared lockout/throttle. Unset = database table. |
| `REDIS_KEY_PREFIX` | `lv-s3:` | Prefix for Redis keys (always ends with `:`). |
| `MALWARE_SCANNER` | `off` | `off`, `clamav`, or `webhook`. |
| `CLAMAV_HOST` / `CLAMAV_PORT` | `127.0.0.1` / `3310` | ClamAV daemon (`clamav` / `3310` in Compose). |
| `MALWARE_WEBHOOK_URL` | required if `webhook` | Scanner HTTP endpoint. |
| `MALWARE_WEBHOOK_TIMEOUT_MS` | `30000` | Webhook timeout. |

Postgres/Redis/ClamAV **host** ports: `POSTGRES_PUBLISH_PORT` (5432), `REDIS_PUBLISH_PORT` (6379), `CLAMAV_PUBLISH_PORT` (3310). Set `POSTGRES_PASSWORD` in `.env` if you change the default `lvs3` password; it must match `DATABASE_URL`.

## Local development

Backend uses **Yarn**, frontend uses **npm**.

```bash
yarn install:all
cp backend/.env.example backend/.env
yarn dev
```

- UI: [http://localhost:5173](http://localhost:5173)
- Admin API: `http://localhost:9001`
- S3: `http://localhost:9000`

Login with `ADMIN_BOOTSTRAP_USERNAME` / `ADMIN_BOOTSTRAP_PASSWORD` from `backend/.env`.

Frontend (Vite): copy `frontend/.env.example` → `frontend/.env`. `VITE_ADMIN_PROXY=1` sends admin API calls through the dev server so the refresh cookie works. `VITE_S3_ENDPOINT` / `VITE_S3_REGION` are the browser S3 client defaults.

```bash
yarn test          # backend unit + API e2e, frontend Vitest
yarn test:e2e      # Playwright against a production-built UI
```

Admin REST: `POST /auth/login` on port **9001**, then `Authorization: Bearer <token>`.

## S3 clients

Always set **path style** and a matching region (e.g. `us-east-1`). In production, use admin S3 keys (`GET /auth/s3-credentials`) or a **service account** — not `S3_ROOT_*`.

Endpoint: `http://HOST:9000` (no trailing slash).

### AWS CLI

```bash
export AWS_ACCESS_KEY_ID=<key>
export AWS_SECRET_ACCESS_KEY=<secret>
export AWS_DEFAULT_REGION=us-east-1

aws s3 ls --endpoint-url http://localhost:9000
aws s3 mb s3://my-bucket --endpoint-url http://localhost:9000
aws s3 cp ./file.txt s3://my-bucket/file.txt --endpoint-url http://localhost:9000
```

### JavaScript

```ts
import { S3Client } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: 'us-east-1',
  endpoint: 'http://localhost:9000',
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});
```

### Python (boto3)

```python
import boto3
from botocore.config import Config

s3 = boto3.client(
    "s3",
    endpoint_url="http://localhost:9000",
    aws_access_key_id="...",
    aws_secret_access_key="...",
    region_name="us-east-1",
    config=Config(s3={"addressing_style": "path"}),
)
```

## Compatibility and limits

LV S3 is a **single-instance** subset of Amazon S3. There is no clustering, erasure coding, versioning, CopyObject, or Range GET.

**Supported:** ListBuckets, CreateBucket / DeleteBucket (empty only), HeadBucket, ListObjectsV2, GetObject / HeadObject, PutObject / DeleteObject, presigned URLs, multipart (Initiate / UploadPart / Complete / Abort / ListParts), SigV4 (header + presigned).

**Not supported:** virtual-hosted buckets (always path-style), CopyObject, versioning, tagging XML API, ACL XML API (use admin `publicRead`), POST form upload, S3 XML lifecycle (use admin REST `/lifecycle/{bucket}`), event notifications, Range GET.

PutObject and UploadPart stream to disk. `S3_MAX_SINGLE_PUT_BYTES` caps non-multipart uploads (default 100 MiB). Streaming requests may use `x-amz-content-sha256: UNSIGNED-PAYLOAD`.

## Releases

On `main` (or `master`):

```bash
yarn release
```

This stages all non-ignored working-tree changes, patch-bumps the version (`0.1.0` → `0.1.1`), commits `release: v0.1.1`, and pushes the branch plus git tag `v0.1.1`. GitHub Actions then:

1. Creates a GitHub Release (notes from commits since the previous tag)
2. Builds `linux/amd64` and `linux/arm64` and pushes to Docker Hub as `TheMertos/lv-s3` with tags `0.1.1`, `0.1`, `0`, and `latest`

Set repository secrets `DOCKERHUB_USERNAME=TheMertos` and `DOCKERHUB_TOKEN` (Hub access token). Preview without pushing: `yarn release:dry`.

## Layout

| Path | Role |
|------|------|
| `backend/` | NestJS — S3 API + admin API |
| `frontend/` | Vite + React (Mantine) console |
| `e2e/` | Playwright |
| `tests/docker-e2e/` | Post-compose smoke tests |

## License

[MIT](LICENSE)
