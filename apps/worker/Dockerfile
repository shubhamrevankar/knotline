ARG NODE_IMAGE=node:24.18.1-alpine3.23@sha256:c2cc26d8f991c2db236ad51a61efee843c482372d6d22570787309d511694110

FROM ${NODE_IMAGE} AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/operations/package.json packages/operations/package.json
COPY packages/retrieval/package.json packages/retrieval/package.json
COPY packages/knowledge-graph/package.json packages/knowledge-graph/package.json
COPY packages/connector-sdk/package.json packages/connector-sdk/package.json
RUN pnpm install --frozen-lockfile --filter @knotline/worker...
COPY apps/worker apps/worker
COPY packages/contracts packages/contracts
COPY packages/db packages/db
COPY packages/operations packages/operations
COPY packages/retrieval packages/retrieval
COPY packages/knowledge-graph packages/knowledge-graph
COPY packages/connector-sdk packages/connector-sdk
RUN pnpm --filter @knotline/contracts build \
 && pnpm --filter @knotline/operations build \
 && pnpm --filter @knotline/retrieval build \
 && pnpm --filter @knotline/knowledge-graph build \
 && pnpm --filter @knotline/connector-sdk build \
 && pnpm --filter @knotline/db build \
 && pnpm --filter @knotline/worker build \
 && pnpm --filter @knotline/worker deploy --prod /opt/knotline

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
LABEL org.opencontainers.image.title="Knotline Runtime Worker" \
      org.opencontainers.image.description="Durable Knotline Temporal workflow worker"
COPY --from=build --chown=node:node /opt/knotline/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/worker/dist ./dist
COPY --from=build --chown=node:node /workspace/apps/worker/package.json ./package.json
USER node
CMD ["node", "dist/main.js"]
