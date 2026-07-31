import { assertOperationalOwner, assertRunbook, type OperationalOwner } from "./ownership.js";

export type ControlFlagKind = "feature" | "kill_switch";
export type FlagRisk = "ordinary" | "external_write" | "expensive_work";

export interface ControlFlagDefinition<Id extends string = string> {
  readonly id: Id;
  readonly kind: ControlFlagKind;
  readonly risk: FlagRisk;
  readonly description: string;
  readonly defaultValue: boolean;
  readonly safeValue: boolean;
  readonly owner: OperationalOwner;
  readonly runbook: string;
  readonly expiresAt?: string;
}

export type ControlFlagRegistry<T extends readonly ControlFlagDefinition[]> = {
  readonly [Definition in T[number] as Definition["id"]]: Definition;
};

const FLAG_ID = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;

function validateFlag(definition: ControlFlagDefinition): void {
  if (!FLAG_ID.test(definition.id)) throw new Error(`Invalid control flag ID: ${definition.id}`);
  if (!definition.description.trim())
    throw new Error(`Flag description is required: ${definition.id}`);
  assertOperationalOwner(definition.owner);
  assertRunbook(definition.runbook);
  if (definition.kind === "kill_switch" && definition.safeValue !== true) {
    throw new Error(`Kill switch safeValue must engage the switch: ${definition.id}`);
  }
  if (
    definition.kind === "feature" &&
    definition.risk !== "ordinary" &&
    (definition.defaultValue || definition.safeValue)
  ) {
    throw new Error(`Risky feature must default and fail closed: ${definition.id}`);
  }
  if (definition.expiresAt && !Number.isFinite(Date.parse(definition.expiresAt))) {
    throw new Error(`Flag expiry must be an ISO timestamp: ${definition.id}`);
  }
}

export function defineControlFlags<const T extends readonly ControlFlagDefinition[]>(
  definitions: T
): ControlFlagRegistry<T> {
  const registry: Record<string, ControlFlagDefinition> = {};
  for (const definition of definitions) {
    validateFlag(definition);
    if (registry[definition.id]) throw new Error(`Duplicate control flag: ${definition.id}`);
    registry[definition.id] = Object.freeze({
      ...definition,
      owner: Object.freeze({ ...definition.owner })
    });
  }
  return Object.freeze(registry) as ControlFlagRegistry<T>;
}

export function resolveControlFlag(
  definition: ControlFlagDefinition,
  configuredValue: boolean | undefined,
  configurationAvailable = true
): boolean {
  if (!configurationAvailable) return definition.safeValue;
  return configuredValue ?? definition.defaultValue;
}
