import { describe, expect, it } from "vitest";
import {
  domainChallenge,
  resolvePolicy,
  scimEtag,
  verifySsoBinding
} from "./enterprise-identity.js";
describe("enterprise identity", () => {
  it("binds every SSO transaction dimension and expiry", () => {
    const tx = {
      connectionId: "c",
      requestId: "r",
      relayState: "s",
      browserNonce: "b",
      acs: "https://example.test/acs",
      expiresAt: Date.now() + 1000
    };
    expect(verifySsoBinding(tx, tx)).toBe(true);
    expect(verifySsoBinding(tx, { ...tx, browserNonce: "x" })).toBe(false);
    expect(verifySsoBinding(tx, tx, tx.expiresAt + 1)).toBe(false);
  });
  it("creates deterministic domain challenges and SCIM versions", () => {
    expect(domainChallenge("example.test", "nonce")).toMatch(
      /^knotline-verification=[a-f0-9]{64}$/
    );
    expect(scimEtag(4)).toBe('W/"4"');
  });
  it("applies exception then workspace then organization precedence", () => {
    expect(resolvePolicy("org", "workspace", "exception")).toBe("exception");
    expect(resolvePolicy("org", undefined, undefined)).toBe("org");
  });
});
