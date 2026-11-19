# ==============================================================================
# Dockerfile for @prozo/api (Express REST API)
# Multi-stage production build
# ==============================================================================

FROM node:20-bookworm-slim AS base

# Install required system packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm matching repo lockfile (v9)
RUN npm install -g pnpm@9.15.4

WORKDIR /app

# Copy root manifests and configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY prisma ./prisma/

# Copy package manifests for layer caching
COPY packages/shared/package.json ./packages/shared/
COPY packages/finance/package.json ./packages/finance/
COPY packages/ai/package.json ./packages/ai/
COPY apps/api/package.json ./apps/api/

# Install dependencies
RUN pnpm install --prefer-frozen-lockfile

# Generate Prisma Client
RUN pnpm prisma:generate

# Copy source code
COPY packages ./packages
COPY apps/api ./apps/api
COPY scripts ./scripts

# Build shared packages
RUN pnpm --filter @prozo/shared build \
    && pnpm --filter @prozo/finance build \
    && pnpm --filter @prozo/ai build

# Expose API port
EXPOSE 4000

ENV NODE_ENV=production
ENV API_PORT=4000

# Make entrypoint executable
RUN chmod +x ./scripts/docker-entrypoint-api.sh

ENTRYPOINT ["./scripts/docker-entrypoint-api.sh"]
