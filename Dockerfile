# syntax=docker/dockerfile:1
# Feedback Hub — ảnh Docker một-giai-đoạn-build, chạy bằng `next start`.

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json* ./
# postinstall gọi prisma generate nhưng chưa có prisma/ ở giai đoạn này
RUN npm ci --ignore-scripts

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG HUB_BASE_PATH=
ENV NEXT_TELEMETRY_DISABLED=1 HUB_BASE_PATH=${HUB_BASE_PATH}
# prisma generate và next build không cần DB thật
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
# Tiền tố đường dẫn phải có cả lúc chạy (next start đọc lại next.config.ts), không chỉ lúc build.
ARG HUB_BASE_PATH=
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HUB_BASE_PATH=${HUB_BASE_PATH}
RUN apk add --no-cache libc6-compat openssl \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts /app/next.config.ts /app/tsconfig.json ./
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Thư mục lưu tệp đính kèm. Volume gắn vào đây phải thuộc user chạy app, không thì mọi lần tải tệp lên đều lỗi quyền ghi.
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data /app/.next
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0 HUB_DATA_DIR=/app/data
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
