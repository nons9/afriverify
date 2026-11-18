# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build
# postbuild copies src/db/migrations → dist/db/migrations automatically

# ── Production stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Migrate, THEN start. `&&` (not `;`) so a failed migration stops the container: the deploy fails its health
# check and the previous, working version keeps serving. (It used to be `;`, which started the app anyway on a
# half-migrated database and hid migration failures for weeks.) Concurrent replicas serialise on an advisory lock.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
