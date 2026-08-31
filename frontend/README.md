# LV S3 — Frontend

Vite + React admin console for bucket management, object browser, lifecycle rules, and service accounts.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server (default :5173) |
| `npm run build` | Production build to `dist/` |
| `npm test` | Vitest unit tests |
| `npm run lint` | ESLint |
| `npm run generate:client` | Regenerate OpenAPI types from `../backend/openapi/admin.openapi.json` |

## API client

- **Types:** `src/api/generated/admin-api.d.ts` (generated — do not edit)
- **Client:** `src/api/client.ts` (`openapi-fetch` + Bearer middleware)
- **Facades:** `src/api/admin.ts` (stable function exports used by hooks/pages)

After backend DTO or controller changes:

```bash
cd ../backend && yarn generate:openapi
cd ../frontend && npm run generate:client
```

## i18n

Source locale: `src/i18n/messages/en.ts`. Use `useT()` from `src/i18n/context.tsx` for UI copy.

## Environment

Copy `.env.example` to `.env`. Key variables:

- `VITE_ADMIN_PROXY=1` — proxy admin API through Vite (E2E / same-origin dev)
- `VITE_ADMIN_PORT` — admin API port when not using proxy (default 9001)

Parent project docs: [../README.md](../README.md).
