ARG NODE_IMAGE=node:24.18.1-alpine3.23@sha256:c2cc26d8f991c2db236ad51a61efee843c482372d6d22570787309d511694110

FROM ${NODE_IMAGE} AS dependencies
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/operations/package.json packages/operations/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/retrieval/package.json packages/retrieval/package.json
COPY packages/knowledge-graph/package.json packages/knowledge-graph/package.json
COPY packages/connector-sdk/package.json packages/connector-sdk/package.json
RUN pnpm install --frozen-lockfile --filter @knotline/api...

FROM dependencies AS build
COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/contracts packages/contracts
COPY packages/config packages/config
COPY packages/operations packages/operations
COPY packages/db packages/db
COPY packages/retrieval packages/retrieval
COPY packages/knowledge-graph packages/knowledge-graph
COPY packages/connector-sdk packages/connector-sdk
RUN pnpm --filter @knotline/contracts build \
  && pnpm --filter @knotline/config build \
  && pnpm --filter @knotline/operations build \
  && pnpm --filter @knotline/retrieval build \
  && pnpm --filter @knotline/knowledge-graph build \
  && pnpm --filter @knotline/connector-sdk build \
  && pnpm --filter @knotline/db build \
  && pnpm --filter @knotline/api build \
  && pnpm --filter @knotline/api deploy --prod /opt/knotline

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    KNOTLINE_API_PORT=4100
WORKDIR /app
LABEL org.opencontainers.image.title="Knotline API" \
      org.opencontainers.image.description="Knotline control-plane API" \
      com.knotline.health.path="/health/live" \
      com.knotline.readiness.path="/health/ready"
COPY --from=build --chown=node:node /opt/knotline/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/api/dist ./dist
COPY --from=build --chown=node:node /workspace/apps/api/package.json ./package.json
USER node
EXPOSE 4100
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4100/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/server.js"]
