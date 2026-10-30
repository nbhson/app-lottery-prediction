# ============================================================
# Vietlott Prediction — production image
# Multi-stage: build → runtime tối giản (node:22-slim)
# ============================================================

# ---------- Stage 1: build ----------
FROM node:22-slim AS builder
WORKDIR /app

# Copy manifest trước để tận dụng layer cache
COPY package.json package-lock.json ./
# better-sqlite3: không có prebuild cho mọi nền tảng (vd linux/arm64)
# → cần toolchain để node-gyp biên dịch native addon
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*
RUN npm ci

# Copy source + build (standalone output — bật qua BUILD_STANDALONE=1)
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    BUILD_STANDALONE=1
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# User không đặc quyền
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Copy server standalone + static assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Native addon better-sqlite3 (serverExternalPackages — không nằm trong bundle).
# v13 không còn cần bindings/file-uri-to-path lúc runtime.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

# Thư mục dữ liệu SQLite — mount volume để bền vững qua các lần chạy
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data
VOLUME ["/app/data"]

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
