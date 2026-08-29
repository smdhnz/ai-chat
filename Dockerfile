# syntax=docker/dockerfile:1
FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json bun.lock vite.config.ts tsconfig.json index.html ./
RUN bun install --frozen-lockfile
COPY src ./src
RUN bun run build

FROM oven/bun:1-alpine AS production-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine
WORKDIR /app
RUN apk add --no-cache ca-certificates tini
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY src ./src
COPY skills ./skills
RUN mkdir -p /app/data
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "run", "start"]
