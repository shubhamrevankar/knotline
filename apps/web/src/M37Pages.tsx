import { Badge, Button, Card } from "@knotline/ui";
import { GitBranch, PackageCheck, RotateCcw } from "lucide-react";
import "./M37Pages.css";
export function ReleasesPage() {
  return (
    <main className="release-console">
      <Badge tone="warning">
        <PackageCheck aria-hidden />
        Build once, promote by digest
      </Badge>
      <h1>Releases and rollback readiness</h1>
      <p>
        Only signed artifacts with SBOM, provenance, compatible migrations, healthy canaries, and
        unchanged tested topology can advance.
      </p>
      <section className="release-flow">
        <Card>
          <h2>Candidate</h2>
          <Badge tone="success">Engineering verified</Badge>
          <p>Digest, SBOM, provenance, migrations, evidence index.</p>
        </Card>
        <GitBranch aria-hidden />
        <Card>
          <h2>Staging</h2>
          <Badge tone="warning">Not deployed</Badge>
          <p>Protected environment approval and health window required.</p>
        </Card>
        <GitBranch aria-hidden />
        <Card>
          <h2>Production</h2>
          <Badge tone="warning">Not deployed</Badge>
          <p>Exact digest and module parity required.</p>
        </Card>
      </section>
      <Card>
        <h2>
          <RotateCcw aria-hidden />
          Rollback target
        </h2>
        <p>
          The previous signed digest remains eligible only while schema and static assets are
          compatible.
        </p>
        <Button>Preview rollback decision</Button>
      </Card>
    </main>
  );
}
