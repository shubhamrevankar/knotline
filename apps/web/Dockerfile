ARG NODE_IMAGE=node:24.18.1-alpine3.23@sha256:c2cc26d8f991c2db236ad51a61efee843c482372d6d22570787309d511694110
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.29.4-alpine@sha256:a6c4f61f456b85b8fdf7ec7ab28cc3e299440e6fb4a9dea520e5fd8fd440025e

FROM ${NODE_IMAGE} AS dependencies
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile --filter @knotline/web...

FROM dependencies AS build
COPY tsconfig.base.json ./
COPY apps/web apps/web
COPY packages/contracts packages/contracts
COPY packages/ui packages/ui
RUN pnpm --filter @knotline/contracts build \
  && pnpm --filter @knotline/ui build \
  && pnpm --filter @knotline/web build

FROM ${NGINX_IMAGE} AS runtime
LABEL org.opencontainers.image.title="Knotline Web" \
      org.opencontainers.image.description="Knotline static web application" \
      com.knotline.health.path="/health" \
      com.knotline.readiness.path="/ready"
COPY --chown=101:101 apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=101:101 /workspace/apps/web/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD ["wget", "--quiet", "--spider", "http://127.0.0.1:8080/health"]
