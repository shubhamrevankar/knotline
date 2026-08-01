/* eslint-disable knotline/no-hardcoded-user-visible-string -- M35 assurance copy is an owned, English-only security catalog pending additional locale catalogs. */
import { Badge, Card } from "@knotline/ui";
import { FileCheck2, ScanSearch, ShieldCheck } from "lucide-react";
import "./M35Pages.css";
const controls = [
  {
    name: "Tenant isolation",
    state: "implemented",
    evidence: "Forced RLS and authorization attack corpus"
  },
  {
    name: "Identity and sessions",
    state: "implemented",
    evidence: "Replay, rotation, step-up, SSO binding"
  },
  {
    name: "Supply chain",
    state: "implemented",
    evidence: "Pinned lockfile, SBOM, provenance, reproducible build"
  },
  {
    name: "Independent penetration test",
    state: "blocked external",
    evidence: "EXT-017 — no result claimed"
  },
  {
    name: "Legal/privacy approval",
    state: "blocked external",
    evidence: "EXT-016 — no result claimed"
  }
];
export function SecurityAssurancePage() {
  return (
    <main className="security-console">
      <Badge tone="warning">
        <ShieldCheck aria-hidden />
        Security assurance
      </Badge>
      <h1>Controls, evidence, and honest claims</h1>
      <p>
        Engineering controls and external assurance are tracked separately. A blocked independent
        review never appears as implemented certification.
      </p>
      <section className="security-grid">
        <Card>
          <h2>
            <ScanSearch aria-hidden />
            Threat model
          </h2>
          <p>
            Six primary attack families map to mitigations, automated suites, residual risk, owner,
            and 90-day review.
          </p>
          <Badge tone="success">Current</Badge>
        </Card>
        <Card>
          <h2>
            <FileCheck2 aria-hidden />
            Release artifact
          </h2>
          <p>
            SBOM, provenance, digest signature, vulnerability gate, and admission verification form
            one chain.
          </p>
          <Badge tone="success">Engineering verified</Badge>
        </Card>
        {controls.map((control) => (
          <Card key={control.name}>
            <h2>{control.name}</h2>
            <Badge tone={control.state === "implemented" ? "success" : "warning"}>
              {control.state}
            </Badge>
            <p>{control.evidence}</p>
          </Card>
        ))}
      </section>
    </main>
  );
}
