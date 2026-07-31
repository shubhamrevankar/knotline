import type { WorkflowDefinition } from "@knotline/contracts";

const KEY_PREFIX = "knotline.studio.recovery.key.";
const VALUE_PREFIX = "knotline.studio.recovery.value.";

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

async function recoveryKey(workflowId: string) {
  const storageKey = `${KEY_PREFIX}${workflowId}`;
  let encoded = sessionStorage.getItem(storageKey);
  if (!encoded) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    encoded = encode(bytes);
    sessionStorage.setItem(storageKey, encoded);
  }
  return crypto.subtle.importKey("raw", decode(encoded), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function saveEncryptedRecovery(workflowId: string, definition: WorkflowDefinition) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await recoveryKey(workflowId),
    new TextEncoder().encode(JSON.stringify(definition))
  );
  localStorage.setItem(
    `${VALUE_PREFIX}${workflowId}`,
    JSON.stringify({ version: 1, iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) })
  );
}

export async function loadEncryptedRecovery(
  workflowId: string
): Promise<WorkflowDefinition | undefined> {
  const stored = localStorage.getItem(`${VALUE_PREFIX}${workflowId}`);
  const key = sessionStorage.getItem(`${KEY_PREFIX}${workflowId}`);
  if (!stored || !key) return undefined;
  try {
    const envelope = JSON.parse(stored) as { version: number; iv: string; ciphertext: string };
    if (envelope.version !== 1) return undefined;
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decode(envelope.iv) },
      await recoveryKey(workflowId),
      decode(envelope.ciphertext)
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as WorkflowDefinition;
  } catch {
    return undefined;
  }
}

export function clearEncryptedRecovery(workflowId: string) {
  localStorage.removeItem(`${VALUE_PREFIX}${workflowId}`);
}
