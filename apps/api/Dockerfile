ARG NODE_IMAGE=node:24.18.1-alpine3.23@sha256:c2cc26d8f991c2db236ad51a61efee843c482372d6d22570787309d511694110

FROM ${NODE_IMAGE} AS dependencies
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/operations/package.json packages/operations/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/contracts packages/contracts
COPY packages/config packages/config
COPY packages/operations packages/operations
RUN pnpm --filter @knotline/contracts build \
  && pnpm --filter @knotline/config build \
  && pnpm --filter @knotline/operations build \
  && pnpm --filter @knotline/api build \
  && pnpm --filter @knotline/api deploy --prod /opt/knotline

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    KNOTLINE_API_PORT=4100
WORKDIR /app
LABEL org.opencontainers.image.title="Knotline API" \
      org.opencontainers.image.description="Knotline control-plane API" \
      com.knotline.health.path="/health" \
      com.knotline.readiness.path="/ready"
COPY --from=build --chown=node:node /opt/knotline/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/api/dist ./dist
COPY --from=build --chown=node:node /workspace/apps/api/package.json ./package.json
USER node
EXPOSE 4100
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4100/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/server.js"]
