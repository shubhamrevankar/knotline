export type ConsentPreference = "essential" | "measurement";

export const CONSENT_STORAGE_KEY = "knotline.consent.v1";

export function readConsent(storage: Pick<Storage, "getItem">): ConsentPreference | null {
  const value = storage.getItem(CONSENT_STORAGE_KEY);
  return value === "essential" || value === "measurement" ? value : null;
}

export function writeConsent(
  storage: Pick<Storage, "setItem">,
  preference: ConsentPreference
): void {
  storage.setItem(CONSENT_STORAGE_KEY, preference);
}

export function measurementAllowed(
  preference: ConsentPreference | null,
  doNotTrack: string | null = globalThis.navigator?.doNotTrack ?? null
): boolean {
  return preference === "measurement" && doNotTrack !== "1";
}
