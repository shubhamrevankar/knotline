ARG NODE_IMAGE=node:24.18.1-alpine3.23@sha256:c2cc26d8f991c2db236ad51a61efee843c482372d6d22570787309d511694110

FROM ${NODE_IMAGE} AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/model-gateway/package.json apps/model-gateway/package.json
COPY packages/model-gateway/package.json packages/model-gateway/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile
COPY apps/model-gateway apps/model-gateway
COPY packages/model-gateway packages/model-gateway
COPY packages/contracts packages/contracts
RUN pnpm --filter @knotline/contracts build \
 && pnpm --filter @knotline/model-gateway build \
 && pnpm --filter @knotline/model-gateway-service build \
 && pnpm --filter @knotline/model-gateway-service deploy --prod /opt/knotline

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production MODEL_GATEWAY_PORT=4200
WORKDIR /app
LABEL org.opencontainers.image.title="Knotline Model Gateway" \
      org.opencontainers.image.description="Credential-isolated governed model transport"
COPY --from=build --chown=node:node /opt/knotline/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/model-gateway/dist ./dist
COPY --from=build --chown=node:node /workspace/apps/model-gateway/package.json ./package.json
USER node
EXPOSE 4200
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4200/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/server.js"]
