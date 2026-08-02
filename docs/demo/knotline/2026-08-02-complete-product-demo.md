# Knotline Complete Product Demo

## Purpose

This runbook presents Knotline as a complete, connected product journey using only local services and synthetic data. It does not require a company account, company network, private package registry, external provider credential, or third-party model key.

The primary story demonstrates that Knotline coordinates governed human and agent work durably:

1. A user signs in through the local identity provider.
2. The user starts the published **Launch intelligence brief** workflow.
3. The durable worker records the trigger and executes the governed market-intelligence agent.
4. The agent output is persisted with structured output, usage, cost, and provenance.
5. A leadership approval becomes ready with the exact proposed action, risk, and diff.
6. The eligible user approves the packet.
7. A human publication task becomes ready in the inbox.
8. The assignee submits the immutable publication note.
9. The workflow resumes and reaches `succeeded` with a complete event timeline.

## Start the complete local product

From the repository root, run:

```bash
pnpm local:preview
```

This one command starts the isolated local infrastructure and all three application processes:

- PostgreSQL for durable product state
- Redis for local coordination primitives
- MinIO for object storage
- Mailpit for local email delivery inspection
- Temporal and its local UI for durable orchestration
- Knotline API on `http://localhost:4100`
- Knotline web application on `http://localhost:5173`
- Knotline worker on the `knotline-system-v1` task queue

Keep that terminal running. Open `http://localhost:5173` in a browser.

## Sign in

1. Select **Continue with Google**.
2. The local identity provider completes the development identity flow without contacting Google.
3. Return to the workflow library if the browser does not navigate there automatically.

All demo users, workspaces, workflow content, agent output, approvals, and human submissions are synthetic.

## Presenter flow

### 1. Introduce the workflow library

Open `/app/workflows` and select **Launch intelligence brief**.

Explain that the selected workflow is a published, versioned executable definition. Version 14 is the current published demo version; version 15 remains the editable draft. The workflow contains four connected nodes:

- `launch_signal`: manual trigger
- `research_brief`: governed agent
- `leadership_review`: consequential-action approval
- `publish_brief`: assigned human form

### 2. Start a real run

Select **Run workflow**. Knotline admits the run, creates its database projection and approval packet, reserves policy capacity, starts the Temporal workflow, and navigates directly to the real run room.

The run room polls the server-backed projection. It does not manufacture the displayed run, task, or event state in the browser.

### 3. Inspect governed agent work

In the run outline, open **research brief** after it succeeds. Show:

- structured input and output
- queue class and state version
- market signals
- executive summary
- recommendation

The self-contained demo uses deterministic synthetic agent steps so it remains reliable and private. Those steps still pass through the governed agent runtime and persist execution, provenance, token usage, and cost records. A configured deployment can replace those recorded steps with the model gateway without changing the workflow contract.

### 4. Review the approval

Open the **leadership review** node or `/app/approvals`. The approval packet shows the proposed publication action, affected audience, risk level, findings, and exact diff. Select **Approve** and provide an optional reason.

The decision is immutable and idempotent. Once consumed by the worker, the approval task succeeds and the human publication task becomes ready. The demo approval window is 15 minutes so the presenter has time to explain the packet.

### 5. Complete the human task

Open **publish brief** from the run room or `/app/inbox`. Enter a publication note and select **Submit and complete run**.

The task is assigned to the initiating synthetic user. Submission records an immutable revision, signals the durable workflow, and returns a link to the run room.

### 6. Show the completed audit trail

Return to the run and select **Timeline**. The completed journey includes, in order:

- `approval.requested`
- `run.queued`
- `run.running`
- trigger task start and success
- agent task start and success
- `approval.decided`
- `approval.consumed`
- approval task start and success
- `task.submitted`
- `run.succeeded`

Select **Graph** and **Outline** to show equivalent views of the same persisted task projection. Open `/app/runs` to show that the completed run remains in run history and can be exported to CSV.

## Durable controls demonstration

Start another run and wait for the approval node. Use the run-room controls:

1. Select **Pause** and confirm the persisted run state changes to `paused`.
2. Select **Resume** and confirm it returns to `running`.
3. Select **Cancel** only on a disposable demo run and confirm it reaches `cancelled`.

Pause interrupts approval and human waits. Resume continues the same Temporal execution. Cancel records both `run.cancelling` and `run.cancelled` events.

## Recovery demonstration

To show durable recovery:

1. Start a run and let it reach leadership approval.
2. Stop `pnpm local:preview` with Control-C.
3. Start it again with `pnpm local:preview`.
4. Reopen the persisted run from `/app/runs`.
5. Approve it and complete the human task.

The run continues from its stored Temporal history and PostgreSQL projection rather than restarting from the beginning.

## Additional product surfaces

The same local product includes workflow creation and versioning, guided workflow generation and dry-run simulation, templates, agents and evaluations, approvals, human inbox, connections, files, search, knowledge graph, memory, analytics, workspace access, billing views, developer settings, and operator controls. The core presenter flow above is the strongest demonstration because every state change is connected to the live database and durable worker.

External SaaS writes are intentionally policy- and credential-gated. Demo connections use local synthetic providers; no company system or private account is contacted.

## Verification evidence

The implementation was verified with:

- a live authenticated start-to-finish run through trigger, governed agent, approval, human form, and success
- a live pause, resume, and cancellation control-path run
- a live run completed after stopping and restarting the web, API, and worker processes
- desktop Chromium tests for runs, controls, task inspection, inbox, human submission, and narrow-screen behavior
- TypeScript, lint, formatting, runtime, build, route, brand, and diff-integrity checks

## Reset and stop

Stop application processes with Control-C. To stop local containers while preserving volumes:

```bash
pnpm local:down
```

Re-running the seed is idempotent. Existing run history remains available until local Docker volumes are explicitly removed.
