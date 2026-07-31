import { assertOperationalOwner, assertRunbook, type OperationalOwner } from "./ownership.js";

export type DeletionScope = "workspace" | "user" | "resource" | "retention_expiry";

export interface DeletionRequest {
  readonly requestId: string;
  readonly scope: DeletionScope;
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly requestedAt: string;
  readonly legalHold: boolean;
  readonly reason: string;
}

export interface DeletionReceipt {
  readonly dataClass: string;
  readonly requestId: string;
  readonly deletedRecords: number;
  readonly completedAt: string;
  readonly evidenceReference: string;
}

export interface DeletionVerification {
  readonly complete: boolean;
  readonly checkedAt: string;
  readonly remainingRecords: number;
  readonly evidenceReference: string;
}

export interface DataLifecycleHandler {
  delete(request: DeletionRequest): Promise<DeletionReceipt>;
  verify(request: DeletionRequest): Promise<DeletionVerification>;
}

export interface DataClassRegistration<Id extends string = string> {
  readonly id: Id;
  readonly description: string;
  readonly defaultRetentionDays: number;
  readonly deletionSlaHours: number;
  readonly supportsLegalHold: boolean;
  readonly derivedDataClasses: readonly string[];
  readonly owner: OperationalOwner;
  readonly runbook: string;
  readonly handler: DataLifecycleHandler;
}

const DATA_CLASS = /^[a-z][a-z0-9]*(?:\.[a-z0-9_]+)+$/;

export class DataLifecycleRegistry {
  readonly #registrations = new Map<string, DataClassRegistration>();

  register<const Id extends string>(registration: DataClassRegistration<Id>): this {
    if (!DATA_CLASS.test(registration.id))
      throw new Error(`Invalid data class: ${registration.id}`);
    if (this.#registrations.has(registration.id)) {
      throw new Error(`Duplicate data lifecycle handler: ${registration.id}`);
    }
    if (!registration.description.trim())
      throw new Error(`Data class description is required: ${registration.id}`);
    if (
      !Number.isInteger(registration.defaultRetentionDays) ||
      registration.defaultRetentionDays < 0
    ) {
      throw new Error(`Retention days must be a non-negative integer: ${registration.id}`);
    }
    if (!Number.isInteger(registration.deletionSlaHours) || registration.deletionSlaHours < 1) {
      throw new Error(`Deletion SLA must be a positive integer: ${registration.id}`);
    }
    for (const derived of registration.derivedDataClasses) {
      if (!DATA_CLASS.test(derived) || derived === registration.id) {
        throw new Error(`Invalid derived data class for ${registration.id}: ${derived}`);
      }
    }
    assertOperationalOwner(registration.owner);
    assertRunbook(registration.runbook);
    this.#registrations.set(registration.id, registration);
    return this;
  }

  get(id: string): DataClassRegistration {
    const registration = this.#registrations.get(id);
    if (!registration) throw new Error(`No data lifecycle handler registered for: ${id}`);
    return registration;
  }

  list(): readonly DataClassRegistration[] {
    return [...this.#registrations.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  assertCoverage(requiredDataClasses: readonly string[]): void {
    const missing = requiredDataClasses.filter((id) => !this.#registrations.has(id));
    if (missing.length > 0)
      throw new Error(`Missing data lifecycle handlers: ${missing.join(", ")}`);
  }
}

export function assertDeletionAllowed(
  registration: DataClassRegistration,
  request: DeletionRequest
): void {
  if (request.legalHold) {
    throw new Error(`Deletion blocked by legal hold for data class: ${registration.id}`);
  }
  if (!request.reason.trim()) throw new Error("Deletion reason is required");
  if (!Number.isFinite(Date.parse(request.requestedAt)))
    throw new Error("Deletion requestedAt is invalid");
}
