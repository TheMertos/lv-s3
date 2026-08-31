# LV S3 — Backend

NestJS application: **Admin API** (JWT, port 9001) and **S3-compatible API** (SigV4, port 9000) in one process.

## Scripts

| Command | Description |
|---------|-------------|
| `yarn start:dev` | Watch mode |
| `yarn build` | Compile to `dist/` |
| `yarn test` | Unit tests (Jest) |
| `yarn test:e2e` | API e2e (Jest + supertest) |
| `yarn lint` | ESLint |
| `yarn generate:openapi` | Write `openapi/admin.openapi.json` |
| `yarn generate:api` | OpenAPI spec + frontend client types |

## Architecture

| Module | Purpose |
|--------|---------|
| `admin-app.module` | Auth, buckets, lifecycle, multipart, service accounts |
| `s3-app.module` | SigV4 S3 API |
| `common/api-exception.filter` | Unified errors `{ code, message, details?, correlationId? }` |
| `modules/audit` | Audit log for sensitive operations |

Migrations run on startup (`src/migration-runner.ts`). Set `TYPEORM_SYNC=true` only in development.

## OpenAPI

Swagger UI: `/docs` when `ADMIN_SWAGGER` is enabled (off in production by default).

Regenerate the contract after controller/DTO changes, then regenerate the frontend client (see `frontend/README.md`).

## Environment

Copy `.env.example` to `.env`. Required secrets: `JWT_ACCESS_SECRET`, `MASTER_ENCRYPTION_KEY`.

Parent project docs: [../README.md](../README.md).
