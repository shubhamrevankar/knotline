import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CsvImportBatch,
  DATA_PROVIDER_MANIFESTS,
  SignedWebhookVerifier,
  advanceSyncToken,
  authorizeSharedResource,
  buildBoundedSoql,
  certifyDataProvider,
  importRestOperations,
  inferCsvType,
  neutralizeCsvCell,
  restrictObjectPath,
  validateExternalEndpoint,
  validateS3Policy
} from "./data-providers.js";

const providers = [
  "microsoft-365",
  "google-mail-calendar",
  "salesforce",
  "hubspot",
  "s3-compatible",
  "csv-import",
  "generic-rest",
  "signed-webhook"
] as const;
describe("recorded generic data providers", () => {
  it("declares and truthfully certifies every provider without a live claim", () => {
    for (const provider of providers) {
      expect(DATA_PROVIDER_MANIFESTS[provider].objectTypes.length).toBeGreaterThan(2);
      expect(certifyDataProvider(provider)).toMatchObject({
        engineeringStatus: "RECORDED",
        liveStatus: "BLOCKED_EXTERNAL"
      });
    }
  });
  it("rejects private, non-HTTPS, and non-allowlisted endpoints", () => {
    expect(
      validateExternalEndpoint("https://storage.example.test/api", ["https://storage.example.test"])
        .origin
    ).toBe("https://storage.example.test");
    expect(() => validateExternalEndpoint("http://storage.example.test", [])).toThrow(
      "ENDPOINT_HTTPS_REQUIRED"
    );
    expect(() => validateExternalEndpoint("https://127.0.0.1", ["https://127.0.0.1"])).toThrow(
      "ENDPOINT_PRIVATE_NETWORK"
    );
  });
  it("prevents prefix escape and requires S3 encryption/bucket policy", () => {
    expect(restrictObjectPath("tenant-a/docs/a.pdf", "tenant-a")).toBe("tenant-a/docs/a.pdf");
    expect(() => restrictObjectPath("tenant-a/../../other/secret", "tenant-a")).toThrow(
      "OBJECT_PREFIX_ESCAPE"
    );
    expect(() =>
      validateS3Policy({
        endpoint: "https://s3.example.test",
        allowedOrigins: ["https://s3.example.test"],
        bucket: "allowed",
        allowedBuckets: ["allowed"],
        key: "tenant/a",
        prefix: "tenant",
        encrypted: false
      })
    ).toThrow("SERVER_SIDE_ENCRYPTION_REQUIRED");
  });
  it("builds only bounded field-authorized CRM queries", () => {
    expect(
      buildBoundedSoql(
        { object: "Account", fields: ["Id", "Name"], where: "Name = 'Acme'", limit: 9999 },
        ["Account"],
        ["Id", "Name"]
      )
    ).toContain("LIMIT 2000");
    expect(() =>
      buildBoundedSoql({ object: "Account", fields: ["Secret"] }, ["Account"], ["Id"])
    ).toThrow("CRM_FIELD_NOT_ALLOWED");
    expect(() =>
      buildBoundedSoql(
        { object: "Account", fields: ["Id"], where: "Id IN (SELECT Id FROM User)" },
        ["Account"],
        ["Id"]
      )
    ).toThrow("CRM_FILTER_UNSAFE");
  });
  it("does not broaden delegated/shared resource access from connection ownership", () => {
    const grants = [
      {
        resourceId: "shared-mailbox",
        principalId: "user-a",
        permission: "read" as const,
        delegated: true
      }
    ];
    expect(
      authorizeSharedResource(grants, { resourceId: "shared-mailbox", principalId: "user-a" })
    ).toEqual(grants[0]);
    expect(() =>
      authorizeSharedResource(grants, {
        resourceId: "shared-mailbox",
        principalId: "owner",
        write: true
      })
    ).toThrow("SHARED_RESOURCE_NOT_GRANTED");
  });
  it("handles history/delta reset as bounded rescan and rejects missing tokens", () => {
    expect(advanceSyncToken({ provider: "google-mail-calendar", reset: true })).toMatchObject({
      mode: "bounded-rescan"
    });
    expect(advanceSyncToken({ provider: "microsoft-365", received: "delta-2" })).toMatchObject({
      mode: "incremental",
      token: "delta-2"
    });
    expect(() => advanceSyncToken({ provider: "salesforce" })).toThrow("SYNC_TOKEN_MISSING");
  });
  it("infers CSV types and neutralizes spreadsheet formulas", () => {
    expect(inferCsvType(["1", "2.5"])).toBe("number");
    expect(inferCsvType(["true", "false"])).toBe("boolean");
    expect(neutralizeCsvCell("=CMD()")).toBe("'=CMD()");
  });
  it("supports resumable CSV upsert, row errors, deduplication, and rollback", () => {
    const batch = new CsvImportBatch();
    expect(
      batch.apply(
        [
          { id: "1", amount: "2" },
          { id: "2", amount: "bad" }
        ],
        "id",
        { amount: "number" }
      )
    ).toEqual({ checkpoint: 2, imported: 1, errors: 1 });
    expect(batch.apply([{ id: "1", amount: "3" }], "id", { amount: "number" }).imported).toBe(1);
    expect(batch.rollback()).toEqual({ deleted: 1, state: "ROLLED_BACK" });
  });
  it("imports typed REST operations only through an allowlisted safe base", () => {
    const result = importRestOperations(
      {
        servers: [{ url: "https://api.example.test/v1" }],
        operations: [
          {
            id: "get-item",
            method: "GET",
            path: "/items/{id}",
            idempotent: true,
            risk: "low",
            maxBytes: 1000
          }
        ]
      },
      ["https://api.example.test"]
    );
    expect(result.origins).toEqual(["https://api.example.test"]);
    expect(() =>
      importRestOperations(
        {
          servers: [{ url: "https://api.example.test" }],
          operations: [
            {
              id: "create",
              method: "POST",
              path: "/items",
              idempotent: false,
              risk: "medium",
              maxBytes: 100
            }
          ]
        },
        ["https://api.example.test"]
      )
    ).toThrow("NON_IDEMPOTENT_RISK_REQUIRED");
  });
  it("verifies rotated webhook secrets, schema, age, and replay", () => {
    const now = 2_000_000;
    const verifier = new SignedWebhookVerifier(() => now * 1000);
    const raw = Buffer.from('{"ok":true}'),
      secret = Buffer.from("current"),
      timestamp = now;
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.`)
      .update(raw)
      .digest("hex");
    expect(
      verifier.verify({ raw, timestamp, signature, deliveryId: "d1", schemaVersion: "v1" }, [
        Buffer.from("old"),
        secret
      ]).schemaVersion
    ).toBe("v1");
    expect(() =>
      verifier.verify({ raw, timestamp, signature, deliveryId: "d1", schemaVersion: "v1" }, [
        secret
      ])
    ).toThrow("WEBHOOK_REPLAY");
  });
});
