# syntax=docker/dockerfile:1
FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json next.config.mjs postcss.config.mjs ./
COPY src ./src
COPY public ./public
RUN bun run build

FROM oven/bun:1-alpine AS production-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine
WORKDIR /app
RUN apk add --no-cache ca-certificates tini
ENV NODE_ENV=production PORT=3000 WEB_ORIGIN=http://127.0.0.1:3002 DATA_DIR=/app/data
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY package.json next.config.mjs ./
COPY public ./public
COPY src ./src
RUN mkdir -p /app/data
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "run", "start"]
