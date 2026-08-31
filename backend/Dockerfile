# Build context: repository root (.)
# Image: API + S3 + static UI on ADMIN_PORT (API paths unchanged)

FROM node:20-bookworm-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
ARG VITE_ADMIN_API=
ARG VITE_S3_ENDPOINT=http://localhost:9000
ARG VITE_S3_REGION=us-east-1
ENV VITE_ADMIN_API=$VITE_ADMIN_API
ENV VITE_S3_ENDPOINT=$VITE_S3_ENDPOINT
ENV VITE_S3_REGION=$VITE_S3_REGION
RUN npm run build

FROM node:20-bookworm-slim AS backend-build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci
COPY backend/ ./
RUN npm run build
COPY --from=frontend-build /frontend/dist ./dist/public

FROM node:20-bookworm-slim AS production
RUN apt-get update && apt-get install -y --no-install-recommends \
  tini ca-certificates gosu python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -r nodeapp && useradd -r -g nodeapp nodeapp
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev && npm rebuild sqlite3 && npm cache clean --force \
  && apt-get purge -y python3 make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
COPY --from=backend-build /app/dist ./dist
COPY backend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh && chown -R nodeapp:nodeapp /app
# Start as root so entrypoint can chown /data volume; then drop to nodeapp.
USER root
EXPOSE 9000 9001
ENTRYPOINT ["/docker-entrypoint.sh"]
