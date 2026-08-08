# Knotline résumé demo deployment

This deployment runs the same web application, API, durable Temporal worker, PostgreSQL schema, model gateway, and connector runtime used by the product. It replaces managed cloud dependencies with containers on one personal server; it does not replace product behavior with a preview or static replica.

## What is live

- Google OAuth sessions use secure cookies.
- Workflow generation calls OpenAI through the isolated model gateway.
- Published agent nodes execute their saved prompts and output contracts against run context.
- Slack OAuth connections send governed messages and retain provider delivery receipts.
- REST and signed-webhook connections send real HTTPS requests and retain delivery receipts.
- Workflow runs use Temporal and PostgreSQL rather than browser state.
- Magic links and workspace invitations use Resend when enabled.
- Caddy obtains and renews TLS certificates automatically.

Provider catalog entries without a tested adapter remain visibly marked as requiring provider certification. Do not present Salesforce, Google Drive, or another catalog entry as live until its OAuth adapter and delivery path have passed the same acceptance test as Slack.

## Required accounts

1. A small personal Linux server with Docker Engine and the Compose plugin.
2. A domain or subdomain with an `A` record pointing to that server.
3. A Google Cloud OAuth web client. Add this exact authorized redirect URI:

   `https://YOUR_DOMAIN/callbacks/v1/identity/oauth/google`

4. An OpenAI API key with a small project budget limit.
5. A Resend sending-only API key and verified sender domain. The integration follows Resend's [Send Email API](https://resend.com/docs/api-reference/emails/send-email), including idempotency keys. Resend is optional only if `KNOTLINE_EMAIL_PROVIDER=disabled`; Google sign-in still works, but magic-link sign-in and invitation delivery are then hidden or unavailable.

No Oracle account, certificate, network, registry, or service is used.

## Prepare the server

Clone the repository into a personal directory on the server. From the repository root:

```bash
cp infra/resume/.env.resume.example infra/resume/.env.resume
chmod 600 infra/resume/.env.resume
```

Edit only `infra/resume/.env.resume`. Generate independent secrets; do not reuse a password as a signing key:

```bash
openssl rand -base64 36
openssl rand -base64 36
openssl rand -base64 36
```

Use the output for ordinary password/token fields. Generate each of the four explicitly marked 32-byte base64 keys with a separate invocation:

```bash
openssl rand -base64 32
```

Required validation rules:

- `AUTH_TRANSACTION_ENCRYPTION_KEY` must contain at least 32 characters.
- `EVALUATION_FIXTURE_KEY`, `FILE_SCANNER_ATTESTATION_KEY`, `AUTHORIZATION_PROOF_SIGNING_KEY`, and `CONNECTOR_STATE_SIGNING_KEY` must each decode to exactly 32 bytes.
- `AUTH_EMAIL_FROM` must use the sender domain verified in Resend.
- Only ports 22, 80, and 443 need to be exposed by the server firewall. Restrict SSH to your IP when practical.

## Validate configuration before building

```bash
docker compose \
  --env-file infra/resume/.env.resume \
  -f infra/docker-compose.yml \
  -f infra/resume/docker-compose.yml \
  config --quiet
```

This fails before deployment if a required variable is absent.

## Build and start

```bash
docker compose \
  --env-file infra/resume/.env.resume \
  -f infra/docker-compose.yml \
  -f infra/resume/docker-compose.yml \
  up -d --build
```

The one-shot `migrate` container applies every database migration before the API and worker start. Caddy then serves the product at `https://YOUR_DOMAIN` and provisions TLS. PostgreSQL, Redis, Temporal, MinIO, the model gateway, tool broker, and API are not bound to public host ports.

## First-use acceptance test

Perform this in a clean browser profile:

1. Open the root URL and sign in with Google.
2. Create the first workspace if prompted. Workspace creation provisions roles and the connector catalog; it does not insert synthetic tenant data.
3. Open **Setup guide → Readiness**. Confirm **Live runtime** and a reachable OpenAI model gateway.
4. Create and publish an agent with no tools, a strict JSON output schema, and a clear system/user prompt.
5. Create a REST API or signed-webhook connection using a temporary request inspector endpoint. Confirm the connection becomes active and its test receipt shows an HTTP response.
6. Describe a workflow that uses the published agent and the active connection. Review the generated nodes; the generator is grounded only in capabilities present in this workspace.
7. In the studio, select the active connection for the integration action, validate, publish, and run the workflow.
8. Complete any human task or approval. Confirm the run reaches `succeeded`, the agent output is non-deterministic and relevant to the input, and the connection detail shows the workflow delivery receipt.
9. Invite a second email address and accept the invitation in a separate browser profile.

Do not call the deployment ready for an interview until all nine checks pass.

## Operations

View health and recent failures:

```bash
docker compose \
  --env-file infra/resume/.env.resume \
  -f infra/docker-compose.yml \
  -f infra/resume/docker-compose.yml \
  ps

docker compose \
  --env-file infra/resume/.env.resume \
  -f infra/docker-compose.yml \
  -f infra/resume/docker-compose.yml \
  logs --since=15m api worker model-gateway caddy
```

Deploy a new commit with the same `up -d --build` command. The migration job is idempotent and verifies checksums for migrations that were already applied.

Back up the PostgreSQL and Caddy data volumes before server changes. At minimum, schedule an encrypted daily `pg_dump` to personal object storage and test a restore before sharing the demo publicly.

## Cost controls

- Set a hard monthly budget in the OpenAI project.
- Keep model-gateway concurrency low for the public demo.
- Stop the stack when it is not being evaluated if the server is billed hourly.
- Resend and Google OAuth can remain on their free tiers within their published limits; verify current limits in their dashboards.
- Caddy and TLS certificates do not add a separate service charge.

## Known scope boundary

This is a credible résumé deployment, not the enterprise topology. It uses one server and container volumes, has no multi-region failover, and does not claim live certification for catalog providers without adapters. Those constraints affect resilience and integration breadth, not whether the demonstrated AI, agent, workflow, run, identity, invitation, and generic HTTPS connector paths are real.
