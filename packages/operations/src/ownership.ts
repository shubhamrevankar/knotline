export interface OperationalOwner {
  readonly team: string;
  readonly contact: string;
}

const OWNER_PART = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export function assertOperationalOwner(owner: OperationalOwner): void {
  if (!OWNER_PART.test(owner.team)) {
    throw new Error(`Invalid operational owner team: ${owner.team}`);
  }
  if (!OWNER_PART.test(owner.contact)) {
    throw new Error(`Invalid operational owner contact: ${owner.contact}`);
  }
}

export function assertRunbook(runbook: string): void {
  if (!runbook.startsWith("docs/operations/knotline/") && !runbook.startsWith("https://")) {
    throw new Error(`Runbook must be an operations-doc path or HTTPS URL: ${runbook}`);
  }
}
