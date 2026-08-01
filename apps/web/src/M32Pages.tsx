import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "@knotline/ui";
import { Building2, Globe2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import {
  createSsoConnection,
  createVerifiedDomain,
  fetchEnterprisePolicies,
  fetchSsoConnections,
  fetchVerifiedDomains,
  putEnterprisePolicy,
  testSsoConnection,
  type EnterprisePolicy,
  type SsoConnection,
  type VerifiedDomain
} from "./api.js";
import "./M32Pages.css";
export function EnterpriseIdentityPage() {
  const [connections, setConnections] = useState<readonly SsoConnection[]>(),
    [domains, setDomains] = useState<readonly VerifiedDomain[]>(),
    [policies, setPolicies] = useState<readonly EnterprisePolicy[]>(),
    [secret, setSecret] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    void Promise.all([fetchSsoConnections(), fetchVerifiedDomains(), fetchEnterprisePolicies()])
      .then(([c, d, p]) => {
        setConnections(c);
        setDomains(d);
        setPolicies(p);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Enterprise controls could not be loaded")
      );
  }, []);
  if (error)
    return (
      <main className="page-shell enterprise-shell">
        <ErrorState title="Enterprise controls unavailable">{error}</ErrorState>
      </main>
    );
  if (!connections || !domains || !policies)
    return (
      <main className="page-shell enterprise-shell">
        <Skeleton label="Loading enterprise controls" />
      </main>
    );
  const addConnection = async () =>
    setConnections([
      await createSsoConnection({
        name: "Workforce identity",
        protocol: "saml",
        issuer: "https://identity.example.test",
        metadata: { spInitiatedOnly: true },
        encryptedConfiguration: "local-encrypted-fixture"
      }),
      ...connections
    ]);
  const testConnection = async (id: string) => {
    const tested = await testSsoConnection(id);
    setConnections(connections.map((item) => (item.id === id ? { ...item, ...tested } : item)));
  };
  const addDomain = async () => {
    const domain = await createVerifiedDomain("example.test");
    setDomains([domain, ...domains]);
    setSecret(domain.challenge ?? "");
  };
  const applyPolicy = async () =>
    setPolicies([
      await putEnterprisePolicy({
        policyKey: "session-security",
        mode: "dry_run",
        rules: { mfaRequired: true, maxHours: 8, idleMinutes: 30 },
        exceptions: []
      })
    ]);
  return (
    <main className="page-shell enterprise-shell">
      <header>
        <Badge tone="accent">
          <Building2 aria-hidden />
          Enterprise control plane
        </Badge>
        <h1>Identity, provisioning, and regional policy</h1>
        <p>
          Test connections before enforcement, preview policy impact, and preserve a break-glass
          path.
        </p>
      </header>
      {secret ? (
        <Card>
          <Badge tone="warning">DNS challenge</Badge>
          <code>{secret}</code>
          <p>Add this record, then verify ownership. It is shown for this setup session.</p>
        </Card>
      ) : null}
      <section className="enterprise-grid">
        <Card>
          <h2>
            <ShieldCheck aria-hidden />
            SSO connections
          </h2>
          <Button onClick={() => void addConnection()}>Add SAML connection</Button>
          {connections.length ? (
            connections.map((item) => (
              <div key={item.id} className="enterprise-row">
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.protocol.toUpperCase()} · {item.state}
                  </small>
                </span>
                {item.state === "draft" ? (
                  <Button size="sm" onClick={() => void testConnection(item.id)}>
                    Run safe test
                  </Button>
                ) : (
                  <Badge tone="success">{item.state}</Badge>
                )}
              </div>
            ))
          ) : (
            <EmptyState title="No enterprise connection">
              Add one without changing sign-in enforcement.
            </EmptyState>
          )}
        </Card>
        <Card>
          <h2>
            <Globe2 aria-hidden />
            Verified domains
          </h2>
          <Button onClick={() => void addDomain()}>Create DNS challenge</Button>
          {domains.map((item) => (
            <p key={item.id}>
              <Badge tone={item.state === "verified" ? "success" : "warning"}>{item.state}</Badge>{" "}
              {item.domain} · {item.enforcement}
            </p>
          ))}
        </Card>
        <Card>
          <h2>Policy impact</h2>
          <p>Rules start in dry-run and record conflicts before staged or enforced activation.</p>
          <Button onClick={() => void applyPolicy()}>Preview secure sessions</Button>
          {policies.map((item) => (
            <p key={item.id}>
              <Badge tone="neutral">{item.mode}</Badge> {item.policyKey} v{item.version}
            </p>
          ))}
        </Card>
        <Card>
          <h2>Residency</h2>
          <p>
            Supported home regions are United States and European Union. Region migration remains an
            observable eligibility, freeze, copy, validate, cutover, rollback, and purge workflow.
          </p>
          <Badge tone="neutral">No migration in progress</Badge>
        </Card>
      </section>
    </main>
  );
}
