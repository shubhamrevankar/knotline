import { beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import type { WorkflowDefinition } from "@knotline/contracts";

import {
  clearEncryptedRecovery,
  loadEncryptedRecovery,
  saveEncryptedRecovery
} from "./studio-recovery.js";

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

const definition: WorkflowDefinition = {
  schemaVersion: 1,
  name: "Recovery",
  description: "",
  inputSchema: {},
  outputSchema: {},
  nodes: [],
  edges: []
};

describe("encrypted studio recovery", () => {
  let local: MemoryStorage;
  let session: MemoryStorage;

  beforeEach(() => {
    local = new MemoryStorage();
    session = new MemoryStorage();
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", session);
    vi.stubGlobal("crypto", webcrypto);
  });

  it("round-trips ciphertext without storing plaintext and clears it", async () => {
    await saveEncryptedRecovery("wf_one", definition);
    expect([...local.values.values()][0]).not.toContain('"name":"Recovery"');
    await expect(loadEncryptedRecovery("wf_one")).resolves.toEqual(definition);
    clearEncryptedRecovery("wf_one");
    await expect(loadEncryptedRecovery("wf_one")).resolves.toBeUndefined();
  });

  it("fails closed for missing keys, unsupported envelopes, and damaged ciphertext", async () => {
    await expect(loadEncryptedRecovery("missing")).resolves.toBeUndefined();
    await saveEncryptedRecovery("wf_two", definition);
    const valueKey = [...local.values.keys()][0]!;
    local.setItem(valueKey, JSON.stringify({ version: 2, iv: "", ciphertext: "" }));
    await expect(loadEncryptedRecovery("wf_two")).resolves.toBeUndefined();
    local.setItem(valueKey, JSON.stringify({ version: 1, iv: "bad", ciphertext: "bad" }));
    await expect(loadEncryptedRecovery("wf_two")).resolves.toBeUndefined();
  });
});
