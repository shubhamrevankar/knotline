#!/usr/bin/env tsx

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { EVENT_SCHEMA_REGISTRY, eventEnvelopeSchema } from "@knotline/contracts";
import { z } from "zod";

const root = resolve(new URL("../..", import.meta.url).pathname);
const output = resolve(root, "packages/contracts/generated/events/registry.json");

type JsonSchema = Record<string, unknown>;

function schemaType(schema: JsonSchema): string | undefined {
  return typeof schema.type === "string" ? schema.type : undefined;
}

function numericConstraint(schema: JsonSchema, name: string): number | undefined {
  return typeof schema[name] === "number" ? schema[name] : undefined;
}

function constraintTighteningErrors(
  previous: JsonSchema,
  next: JsonSchema,
  path: string
): string[] {
  const errors: string[] = [];
  for (const name of ["pattern", "format"] as const) {
    if (previous[name] !== next[name] && next[name] !== undefined) {
      errors.push(`${path} ${name} added or changed`);
    }
  }
  for (const name of ["minimum", "minLength", "minItems"] as const) {
    const before = numericConstraint(previous, name);
    const after = numericConstraint(next, name);
    if (after !== undefined && (before === undefined || after > before)) {
      errors.push(`${path} ${name} tightened`);
    }
  }
  for (const name of ["maximum", "maxLength", "maxItems"] as const) {
    const before = numericConstraint(previous, name);
    const after = numericConstraint(next, name);
    if (after !== undefined && (before === undefined || after < before)) {
      errors.push(`${path} ${name} tightened`);
    }
  }
  if (previous.additionalProperties !== false && next.additionalProperties === false) {
    errors.push(`${path} additive properties disabled`);
  }
  if (
    previous.items &&
    next.items &&
    typeof previous.items === "object" &&
    typeof next.items === "object"
  ) {
    errors.push(
      ...compatibilityErrors(previous.items as JsonSchema, next.items as JsonSchema, `${path}[]`)
    );
  }
  for (const name of ["anyOf", "oneOf", "allOf"] as const) {
    if (next[name] !== undefined && JSON.stringify(previous[name]) !== JSON.stringify(next[name])) {
      errors.push(`${path} ${name} changed`);
    }
  }
  return errors;
}

export function compatibilityErrors(
  previous: JsonSchema,
  next: JsonSchema,
  path = "event"
): string[] {
  const errors: string[] = [];
  if (schemaType(previous) !== schemaType(next)) errors.push(`${path} type changed`);
  errors.push(...constraintTighteningErrors(previous, next, path));
  const previousRequired = new Set(
    Array.isArray(previous.required)
      ? previous.required.filter((item): item is string => typeof item === "string")
      : []
  );
  const nextRequired = new Set(
    Array.isArray(next.required)
      ? next.required.filter((item): item is string => typeof item === "string")
      : []
  );
  for (const field of previousRequired) {
    if (!nextRequired.has(field)) errors.push(`${path} required field removed: ${field}`);
  }
  for (const field of nextRequired) {
    if (!previousRequired.has(field)) errors.push(`${path} required field added: ${field}`);
  }
  const previousProperties =
    typeof previous.properties === "object" && previous.properties !== null
      ? (previous.properties as Record<string, JsonSchema>)
      : {};
  const nextProperties =
    typeof next.properties === "object" && next.properties !== null
      ? (next.properties as Record<string, JsonSchema>)
      : {};
  for (const [field, previousProperty] of Object.entries(previousProperties)) {
    const nextProperty = nextProperties[field];
    if (!nextProperty) {
      errors.push(`${path} property removed: ${field}`);
    } else {
      errors.push(...compatibilityErrors(previousProperty, nextProperty, `${path}.${field}`));
    }
  }
  if (Array.isArray(previous.enum) && Array.isArray(next.enum)) {
    for (const value of previous.enum) {
      if (!next.enum.includes(value)) errors.push(`${path} enum value removed: ${String(value)}`);
    }
  }
  return errors;
}

function generatedRegistry() {
  return {
    registryVersion: 1,
    envelope: {
      schemaVersion: 1,
      compatibility: "BACKWARD",
      schema: z.toJSONSchema(eventEnvelopeSchema, {
        target: "draft-7",
        unrepresentable: "any"
      })
    },
    events: EVENT_SCHEMA_REGISTRY.map((event) => ({
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      owner: event.owner,
      compatibility: "BACKWARD",
      schema: z.toJSONSchema(event.schema, { target: "draft-7", unrepresentable: "any" })
    }))
  };
}

function serializedRegistry(): string {
  return `${JSON.stringify(generatedRegistry(), null, 2)}\n`;
}

async function assertBackwardCompatibleWithPublishedRegistry(): Promise<void> {
  let published: ReturnType<typeof generatedRegistry> | undefined;
  try {
    published = JSON.parse(await readFile(output, "utf8")) as ReturnType<typeof generatedRegistry>;
  } catch {
    return;
  }

  const next = generatedRegistry();
  if (published.envelope) {
    const envelopeErrors = compatibilityErrors(published.envelope.schema, next.envelope.schema);
    if (envelopeErrors.length > 0) {
      throw new Error(`Breaking event envelope change: ${envelopeErrors.join(", ")}`);
    }
  }
  for (const previousEvent of published.events) {
    const candidates = next.events
      .filter((event) => event.eventType === previousEvent.eventType)
      .sort((left, right) => right.eventVersion - left.eventVersion);
    if (candidates.length === 0) {
      throw new Error(`Published event removed: ${previousEvent.eventType}`);
    }
    const sameVersion = candidates.find(
      (event) => event.eventVersion === previousEvent.eventVersion
    );
    if (!sameVersion) {
      throw new Error(
        `Published event version removed: ${previousEvent.eventType} v${String(previousEvent.eventVersion)}`
      );
    }
    const errors = compatibilityErrors(previousEvent.schema, sameVersion.schema);
    if (errors.length > 0) {
      throw new Error(
        `Breaking event change for ${previousEvent.eventType} v${String(previousEvent.eventVersion)}: ${errors.join(", ")}`
      );
    }
  }
}

function selfTest(): void {
  const previous = {
    type: "object",
    required: ["id", "name"],
    properties: { id: { type: "string" }, name: { type: "string" } }
  };
  const breaking = {
    type: "object",
    required: ["id"],
    properties: { id: { type: "number" } }
  };
  const errors = compatibilityErrors(previous, breaking);
  if (errors.length < 3) throw new Error("Breaking event fixture was not rejected.");
  const tightening = compatibilityErrors(
    { type: "string", minLength: 1 },
    { type: "string", minLength: 2, pattern: "^[a-z]+$" }
  );
  if (tightening.length !== 2) throw new Error("Constraint tightening was not rejected.");
  process.stdout.write(
    `event compatibility self-test passed (${String(errors.length)} violations)\n`
  );
}

const mode = process.argv[2] ?? "check";
if (mode === "self-test") {
  selfTest();
} else if (mode === "generate") {
  await assertBackwardCompatibleWithPublishedRegistry();
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, serializedRegistry());
  process.stdout.write(`generated ${output}\n`);
} else if (mode === "check") {
  let actual = "";
  try {
    actual = await readFile(output, "utf8");
  } catch {
    // Missing registry is drift.
  }
  if (actual !== serializedRegistry()) {
    process.stderr.write("Event registry has drifted; run the generation command.\n");
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `event registry passed (${String(EVENT_SCHEMA_REGISTRY.length)} events)\n`
    );
  }
} else {
  throw new Error("Event registry mode must be self-test, generate, or check.");
}
