# Local development and product preview

Knotline has two local startup modes. Both bind only to loopback interfaces and
use the synthetic credentials declared in `.env.example` and
`infra/docker-compose.yml`.

## Lightweight product preview

Use this mode when the workstation already has the repository dependencies and
the pinned dependency images. It starts PostgreSQL, Redis, MinIO, Mailpit, and
Temporal in Docker, then runs the API and web application directly from the
workspace:

```bash
pnpm local:preview
```

Open `http://localhost:5173`. The API readiness endpoint is
`http://localhost:4100/health/ready`, Mailpit is `http://localhost:8025`, and
the Temporal UI is `http://localhost:8233`.

Use `localhost`, not `127.0.0.1`, for the Vite web application because the
development server may bind to the IPv6 loopback address.

Stop the foreground API/web process with `Ctrl+C`, then stop the dependency
containers with:

```bash
pnpm local:down
```

## Complete container build

Use this mode to build and run every service image:

```bash
pnpm local:up
```

The complete build needs sufficient Docker storage for all build layers. Do not
prune a shared workstation's Docker data without first identifying and approving
the exact resources to remove.
