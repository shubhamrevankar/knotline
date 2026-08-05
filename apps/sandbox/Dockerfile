ARG NODE_IMAGE=node:24.18.1-alpine3.23@sha256:c2cc26d8f991c2db236ad51a61efee843c482372d6d22570787309d511694110

FROM ${NODE_IMAGE} AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
RUN pnpm config set registry https://registry.npmmirror.com/
COPY apps/sandbox/package.json apps/sandbox/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile --filter @knotline/sandbox-service...
COPY apps/sandbox apps/sandbox
COPY packages/contracts packages/contracts
RUN pnpm --filter @knotline/contracts build \
 && pnpm --filter @knotline/sandbox-service build \
 && pnpm --filter @knotline/sandbox-service deploy --prod /opt/knotline

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production SANDBOX_PORT=4300
WORKDIR /app
COPY --from=build --chown=node:node /opt/knotline/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/sandbox/dist ./dist
COPY --from=build --chown=node:node /workspace/apps/sandbox/package.json ./package.json
USER node
EXPOSE 4300
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4300/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/server.js"]
