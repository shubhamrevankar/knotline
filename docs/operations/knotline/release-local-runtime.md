# Release-local runtime

## Contract

The release-local runtime serves the production application artifacts on a local machine. It is not a Vite preview, a source-mounted development stack, or a separate demonstration implementation.

The following artifacts are built from the production Dockerfiles and run without rebuilding:

- web: compiled static assets served by the production Nginx image
- API: compiled Node.js control plane
- worker: compiled Temporal workflow and activity worker
- model gateway: compiled governed model transport
- tool broker: compiled credential-isolated tool transport
- sandbox: compiled isolated execution service

Only infrastructure adapters differ between release-local and a hosted deployment. PostgreSQL, Redis, object storage, email capture, and Temporal run as isolated local containers. A hosted environment supplies managed equivalents through configuration.

## Isolation

The Compose project is named `knotline-personal-release`. Its application images use the local-only `knotline-personal/*` namespace. All published ports bind to `127.0.0.1`. Credentials and data are synthetic. The release workflow does not log in to, pull from, or push to a private registry and does not read cloud credentials.

No company account, company registry, company identity, internal endpoint, VPN service, or corporate cloud resource is part of this runtime.

## Build the release artifacts

Stop any development stack that owns the same loopback ports, then run:

```sh
pnpm release:build
```

The build creates six production images tagged `local` by default and writes `artifacts/releases/local.json`. The manifest records the source revision and content-addressed local image ID for every application component.

To create another isolated tag:

```sh
KNOTLINE_RELEASE_TAG=rc-1 pnpm release:build
```

The source tree should be clean before a candidate build. A manifest with `sourceDirty: true` is useful for iteration but must not be promoted.

## Run without rebuilding

```sh
pnpm release:up
pnpm release:verify
```

`release:up` includes `--no-build`. It can only start images already produced by `release:build`; source edits do not affect a running release.

Open the product at `http://localhost:5173`. The browser uses same-origin requests. Nginx forwards application API, callback, edge-authentication, and local identity routes to the API container. The compiled web image contains no environment-specific API hostname, so the same web artifact can be promoted and routed by the target environment.

`release:verify` fails if an image ID differs from the recorded manifest, a required application service is not running, or a web/API health endpoint is unhealthy. It also scans the shipped web bundle for a preview-only API address and completes the full local Google flow through the public origin: authorization, identity-provider redirect, callback, browser-bound exchange, secure session creation, and authenticated workspace bootstrap.

The worker uses an immutable, glibc-based official Node.js image because Temporal's native bridge targets GNU libc. The remaining Node.js services use their pinned Alpine base where no incompatible native runtime is present.

## Stop the runtime

```sh
pnpm release:down
```

Named volumes are preserved. Removing those volumes is a separate destructive operation and is not part of the release commands.

## Promotion rule

A later registry-promotion stage must publish these already-tested image contents, capture registry manifest digests, sign them, and deploy those digests. It must not rebuild application source between local acceptance and promotion.
