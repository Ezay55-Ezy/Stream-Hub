FROM node:22-slim AS base
WORKDIR /app
RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY lib/ lib/
COPY artifacts/api-server/ artifacts/api-server/

RUN pnpm install --frozen-lockfile && \
    pnpm --filter @workspace/api-server run build

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
