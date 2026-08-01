import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface SecretBackend {
  put(reference: string, value: string): Promise<void>;
  get(reference: string): Promise<string | undefined>;
  delete(reference: string): Promise<void>;
}

export class EncryptedMemorySecretBackend implements SecretBackend {
  readonly #values = new Map<string, Buffer>();

  constructor(private readonly key: Buffer) {
    if (key.byteLength !== 32) throw new Error("LOCAL_SECRET_KEY_MUST_BE_32_BYTES");
  }

  put(reference: string, value: string) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    this.#values.set(reference, Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]));
    return Promise.resolve();
  }

  get(reference: string) {
    const encrypted = this.#values.get(reference);
    if (!encrypted) return Promise.resolve(undefined);
    const decipher = createDecipheriv("aes-256-gcm", this.key, encrypted.subarray(0, 12));
    decipher.setAuthTag(encrypted.subarray(12, 28));
    return Promise.resolve(
      Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]).toString("utf8")
    );
  }

  delete(reference: string) {
    this.#values.delete(reference);
    return Promise.resolve();
  }
}

export interface AwsSecretsClient {
  putSecretValue(input: { SecretId: string; SecretString: string }): Promise<unknown>;
  getSecretValue(input: { SecretId: string }): Promise<{ SecretString?: string }>;
  deleteSecret(input: { SecretId: string; ForceDeleteWithoutRecovery: false }): Promise<unknown>;
}

export class AwsSecretsManagerBackend implements SecretBackend {
  constructor(private readonly client: AwsSecretsClient) {}
  async put(reference: string, value: string) {
    await this.client.putSecretValue({ SecretId: reference, SecretString: value });
  }
  async get(reference: string) {
    return (await this.client.getSecretValue({ SecretId: reference })).SecretString;
  }
  async delete(reference: string) {
    await this.client.deleteSecret({ SecretId: reference, ForceDeleteWithoutRecovery: false });
  }
}

export const scrubSecret = (value: unknown, secret: string): unknown => {
  if (typeof value === "string") return value.split(secret).join("[REDACTED]");
  if (Array.isArray(value)) return value.map((item) => scrubSecret(item, secret));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, scrubSecret(item, secret)])
    );
  return value;
};

export class SerializedRefresh {
  readonly #active = new Map<string, Promise<string>>();

  run(credentialId: string, refresh: () => Promise<string>) {
    const existing = this.#active.get(credentialId);
    if (existing) return existing;
    const current = refresh().finally(() => this.#active.delete(credentialId));
    this.#active.set(credentialId, current);
    return current;
  }
}
