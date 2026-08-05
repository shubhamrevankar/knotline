# Live Slack and HubSpot connectors

## What is implemented

Slack and HubSpot are live, customer-authorized connectors. They use OAuth, store access and refresh credentials encrypted, verify the connected account, refresh expiring credentials, expose their actions to workflow generation and Studio, execute provider API calls from the durable worker, and retain bounded action receipts.

Slack actions:

- `message.post` calls `chat.postMessage`.
- `message.update` calls `chat.update`.
- `message.delete` calls `chat.delete`.

HubSpot actions:

- `object.create` creates a CRM object. `objectType` defaults to `contacts`.
- `object.update` updates a CRM object and requires `recordId`.
- `association.create` creates a default association and requires both object types and record IDs.

## Provider application setup

Create one OAuth application in each provider developer console. The callback URL must exactly match the deployment API origin.

Local callback URLs:

- Slack: `http://localhost:4100/callbacks/v1/connections/oauth/slack`
- HubSpot: `http://localhost:4100/callbacks/v1/connections/oauth/hubspot`

Production callback URLs:

- Slack: `https://<api-domain>/callbacks/v1/connections/oauth/slack`
- HubSpot: `https://<api-domain>/callbacks/v1/connections/oauth/hubspot`

Set these secrets in `.env.local` for the local Compose stack, or in the deployment secret store:

```dotenv
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=local-only-change-me
HUBSPOT_CLIENT_ID=
HUBSPOT_CLIENT_SECRET=local-only-change-me
```

Never commit real values. The API and worker must receive the same application credentials and API public origin. The API needs them for authorization and tests; the worker needs them for token refresh during workflow execution.

Required Slack bot scopes are `team:read`, `channels:read`, and `chat:write`. Required HubSpot scopes are `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.companies.read`, and `crm.objects.companies.write`. Live object actions are intentionally constrained to contacts and companies.

## Product flow

1. Open **Connections**, choose Slack or HubSpot, and review scopes and actions.
2. Select **Authorize securely**. The API creates a short-lived, single-use authorization transaction and redirects to the provider.
3. The provider redirects to the callback. The API validates the durable state transaction, exchanges the code server-to-server, verifies the account, encrypts the credential, and activates the connection.
4. Select **Test connection** on the connection detail page at any time. A successful test updates connection health; a failed test marks it degraded and records a safe error.
5. In Workflow Studio, select an integration-action step, choose the active connection, then choose one of the actions declared by that connection.
6. Validation and publication re-evaluate the current draft against current agents and connections. A missing, disabled, or incompatible connection blocks publication.
7. At run time the durable worker renders the configured payload mapping from workflow input and prior outputs, refreshes the provider token when necessary, invokes the provider, and records a bounded receipt without storing the token.

## Action payloads

Slack post message:

```json
{
  "channel": "C0123456789",
  "text": "Recovery completed for ${input.incidentId}"
}
```

Slack update message:

```json
{
  "channel": "C0123456789",
  "ts": "1712345678.123456",
  "text": "Updated status for ${input.incidentId}"
}
```

HubSpot create contact:

```json
{
  "objectType": "contacts",
  "properties": {
    "email": "${input.customerEmail}",
    "firstname": "${input.firstName}",
    "lastname": "${input.lastName}"
  }
}
```

HubSpot update contact:

```json
{
  "objectType": "contacts",
  "recordId": "${input.hubspotContactId}",
  "properties": {
    "lifecyclestage": "customer"
  }
}
```

HubSpot association:

```json
{
  "fromObjectType": "contacts",
  "fromRecordId": "${input.hubspotContactId}",
  "toObjectType": "companies",
  "toRecordId": "${input.hubspotCompanyId}"
}
```

## Security and failure behavior

- OAuth state is short-lived, workspace-bound, user-bound, hashed at rest, and single-use.
- Provider client secrets are deployment secrets and are never returned to the browser.
- Provider access and refresh tokens are AES-256-GCM encrypted before database storage.
- Authorization denial consumes the transaction and returns the connection to a recoverable state.
- A refresh failure or provider rejection fails the workflow step according to its retry and failure policy.
- Receipts store request and response hashes, bounded response excerpts, timing, status, and safe error codes—not credentials.
- Only active or degraded connections can be selected for execution; revoked, disabled, deleted, or partially authorized connections cannot run actions.

## Verification

Run:

```bash
pnpm --filter @knotline/connector-sdk test
pnpm typecheck
pnpm lint
```

For a real smoke test, authorize one test workspace per provider, use **Test connection**, then execute one workflow action against a dedicated Slack channel and a disposable HubSpot contact. Confirm the provider result and the matching receipt on the connection detail page.
