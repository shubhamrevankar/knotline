/* eslint-disable knotline/no-hardcoded-user-visible-string -- M33 help and legal copy is an owned, English-only catalog pending additional locale catalogs. */
import { Badge, Button, Card, EmptyState, ErrorState, Input, Select, Textarea } from "@knotline/ui";
import { BookOpen, LifeBuoy, LockKeyhole, Radio } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import {
  createSupportTicket,
  fetchSupportTickets,
  submitContactRequest,
  type SupportTicket
} from "./api.js";
import "./M33Pages.css";
export function SupportPage() {
  const [tickets, setTickets] = useState<readonly SupportTicket[]>(),
    [error, setError] = useState("");
  useEffect(() => {
    void fetchSupportTickets()
      .then(setTickets)
      .catch((e) => setError(e instanceof Error ? e.message : "Support could not be loaded"));
  }, []);
  if (error)
    return (
      <main className="page-shell experience-shell">
        <ErrorState title="Support unavailable">{error}</ErrorState>
      </main>
    );
  const create = async () =>
    setTickets([
      await createSupportTicket({
        category: "product",
        severity: "normal",
        subject: "Help with a workflow run",
        diagnosticConsent: false
      }),
      ...(tickets ?? [])
    ]);
  return (
    <main className="page-shell experience-shell">
      <header>
        <Badge tone="accent">
          <LifeBuoy aria-hidden />
          Customer support
        </Badge>
        <h1>Get help with clear ownership</h1>
        <p>
          Open a tracked case, share only consented diagnostics, and follow every response through
          resolution.
        </p>
      </header>
      <Button onClick={() => void create()}>Open support case</Button>
      <section className="experience-grid">
        {tickets?.length ? (
          tickets.map((ticket) => (
            <Card key={ticket.id}>
              <Badge tone={ticket.status === "open" ? "warning" : "success"}>{ticket.status}</Badge>
              <h2>{ticket.subject}</h2>
              <p>
                {ticket.category} · {ticket.severity}
              </p>
            </Card>
          ))
        ) : (
          <EmptyState title="No support cases">Your support history will appear here.</EmptyState>
        )}
      </section>
    </main>
  );
}
const content: Readonly<
  Record<
    string,
    { icon: "help" | "status" | "trust"; title: string; body: string; items: readonly string[] }
  >
> = {
  "route.help": {
    icon: "help",
    title: "Help center",
    body: "Practical guidance for building, operating, and troubleshooting reliable work.",
    items: [
      "Build and publish a workflow",
      "Run, pause, resume, and recover work",
      "Configure agents, knowledge, connectors, and notifications",
      "Security, privacy, and account recovery"
    ]
  },
  "route.status": {
    icon: "status",
    title: "System status",
    body: "Current service health and signed incident communications.",
    items: [
      "Application: Operational",
      "Workflow runtime: Operational",
      "Notifications: Operational",
      "Public API: Operational"
    ]
  },
  "route.trust": {
    icon: "trust",
    title: "Trust center",
    body: "Controls and evidence are described precisely; blocked external certifications are never claimed.",
    items: [
      "Tenant isolation and encryption",
      "Secure development and response",
      "Data governance and residency",
      "Subprocessors and assurance status"
    ]
  },
  "route.accessibility": {
    icon: "trust",
    title: "Accessibility",
    body: "Knotline targets WCAG 2.2 AA with keyboard, zoom, reflow, contrast, motion, and assistive-technology coverage.",
    items: [
      "Keyboard-first navigation",
      "Visible focus and semantic landmarks",
      "200% zoom and 320 CSS pixel reflow",
      "Report an accessibility issue through support"
    ]
  }
};
export function InformationPage({ routeId }: { routeId: string }) {
  const page = content[routeId] ?? {
    icon: "trust" as const,
    title: routeId.split(".").at(-1)?.replaceAll("-", " ") ?? "Legal",
    body: "This review-ready publication is versioned and linked to its approval evidence.",
    items: [
      "Effective version: draft 2026-08",
      "Plain-language summary",
      "Contact privacy or legal support for questions"
    ]
  };
  const Icon = page.icon === "help" ? BookOpen : page.icon === "status" ? Radio : LockKeyhole;
  return (
    <main className="public-info">
      <Badge tone="accent">
        <Icon aria-hidden />
        {page.title}
      </Badge>
      <h1>{page.title}</h1>
      <p>{page.body}</p>
      <div className="experience-grid">
        {page.items.map((item) => (
          <Card key={item}>
            <h2>{item}</h2>
            <p>Read the current version and its operational guidance.</p>
          </Card>
        ))}
      </div>
    </main>
  );
}
export function ContactPage() {
  const [state, setState] = useState(""),
    [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await submitContactRequest({
        email: data.get("email"),
        company: data.get("company") || undefined,
        purpose: data.get("purpose"),
        message: data.get("message"),
        consentVersion: "contact-2026-08",
        honeypot: ""
      });
      setState(`Request ${String(result.id)} is ${String(result.state)}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request was not accepted");
    }
  };
  return (
    <main className="public-info">
      <Badge tone="accent">Contact Knotline</Badge>
      <h1>Tell us what you need</h1>
      <p>
        Submissions receive a durable receipt and remain visibly queued if routing is unavailable.
      </p>
      {state ? (
        <Card>
          <Badge tone="success">Received</Badge>
          <p>{state}</p>
        </Card>
      ) : null}
      {error ? <ErrorState title="Could not submit">{error}</ErrorState> : null}
      <form onSubmit={(e) => void submit(e)} className="contact-form">
        <Input name="email" type="email" required label="Work email" />
        <Input name="company" label="Company" />
        <Select name="purpose" label="Purpose" defaultValue="sales">
          <option value="sales">Sales</option>
          <option value="support">Support</option>
          <option value="security">Security</option>
          <option value="privacy">Privacy</option>
          <option value="other">Other</option>
        </Select>
        <Textarea name="message" required minLength={10} label="Message" />
        <label>
          <input type="checkbox" required /> I agree to the contact privacy notice.
        </label>
        <Button type="submit">Send request</Button>
      </form>
    </main>
  );
}
export function GuestPage() {
  return (
    <main className="public-info">
      <Badge tone="warning">External collaboration</Badge>
      <h1>Scoped guest access</h1>
      <p>
        Exchange the one-time invitation from this clean, no-referrer page. Guest sessions expose
        only the invited task, approval, or resource.
      </p>
      <Card>
        <h2>No invitation in this browser</h2>
        <p>
          Ask the workspace owner for a new invitation. Forwarded, expired, revoked, or mismatched
          invitations are rejected.
        </p>
      </Card>
    </main>
  );
}
