ARG NODE_IMAGE=node:24.18.1-alpine3.23@sha256:c2cc26d8f991c2db236ad51a61efee843c482372d6d22570787309d511694110

FROM ${NODE_IMAGE} AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
RUN pnpm config set registry https://registry.npmmirror.com/
COPY apps/tool-broker/package.json apps/tool-broker/package.json
COPY packages/tool-broker/package.json packages/tool-broker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile --filter @knotline/tool-broker-service...
COPY apps/tool-broker apps/tool-broker
COPY packages/tool-broker packages/tool-broker
COPY packages/contracts packages/contracts
RUN pnpm --filter @knotline/contracts build \
 && pnpm --filter @knotline/tool-broker build \
 && pnpm --filter @knotline/tool-broker-service build \
 && pnpm --filter @knotline/tool-broker-service deploy --prod /opt/knotline

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production TOOL_BROKER_PORT=4400
WORKDIR /app
COPY --from=build --chown=node:node /opt/knotline/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/tool-broker/dist ./dist
COPY --from=build --chown=node:node /workspace/apps/tool-broker/package.json ./package.json
USER node
EXPOSE 4400
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4400/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/server.js"]
