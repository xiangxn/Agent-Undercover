# One image for any container host (Railway, Back4App, a VPS).
# Build context is the repo root; .dockerignore keeps keys and build output out.
FROM node:22-slim AS build
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# Install with only the manifests first so source edits do not bust the cache.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
COPY shared/package.json shared/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @agent-undercover/web build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
COPY --from=build /app /app
EXPOSE 8080
CMD ["pnpm", "--filter", "@agent-undercover/server", "start"]
