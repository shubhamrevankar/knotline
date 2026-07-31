# ADR-0001: Fastify and TypeScript for the HTTP control plane

- Status: Accepted
- Date: 2026-07-31
- Owners: API platform
- Milestone: M01

## Context

The control plane needs explicit module boundaries, runtime request validation,
OpenAPI-compatible transport schemas, predictable request hooks, and a shared
type language across browser, API, and worker packages. It must remain easy to
test without starting a network listener.

## Decision

Use strict TypeScript with NodeNext module semantics and Fastify for HTTP and
server-sent event endpoints. Route handlers must validate untrusted input at the
boundary, use the shared request/trace context, and return versioned `/v1`
transport shapes. Fastify plugins are scoped by product module; infrastructure
adapters enter through interfaces rather than global service locators.

## Alternatives considered

- Express has a broad ecosystem but requires more local conventions to achieve
  equivalent schema, plugin-isolation, and typed-route discipline.
- A full-stack framework would accelerate some conventions but couple the
  control plane to its rendering and deployment model.
- A custom Node HTTP layer would minimize dependencies while creating security,
  validation, and lifecycle work with no product advantage.

## Consequences

- Runtime schemas remain authoritative; TypeScript types alone never validate
  network data.
- Plugins must not create hidden cross-module dependencies.
- Framework and Node upgrades require API contract, error-shape, request-ID,
  and plugin-encapsulation regression tests.
- Long-running or durable work is dispatched after a committed intent; it does
  not execute in the HTTP request process.

## Revisit triggers

Revisit if measured framework overhead prevents the published latency target,
Fastify cannot meet a required protocol, or its support/security posture no
longer meets the release policy.
