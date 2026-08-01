import { Badge, Button, Card, ErrorState, Skeleton } from "@knotline/ui";
import { KeyRound, Laptop, LogOut, Mail, ShieldCheck, Waypoints } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  exchangeGoogle,
  exchangeMagicLink,
  fetchMeBootstrap,
  fetchProfile,
  fetchSessions,
  logout,
  requestMagicLink,
  revokeOtherSessions,
  revokeSession,
  startGoogle,
  updateProfile,
  type SessionSummary
} from "./api.js";
import { msg } from "./i18n.js";
import { RequestFailure } from "./query/errors.js";

function AuthLayout({ children }: { readonly children: ReactNode }) {
  return (
    <main className="auth-page">
      <Link className="auth-brand" to="/">
        <Waypoints aria-hidden="true" />
        {msg("brand.name")}
      </Link>
      {children}
      <p className="auth-privacy">{msg("auth.privacy")}</p>
    </main>
  );
}

function failureCopy(error: unknown): { readonly heading: string; readonly body: string } {
  const code = error instanceof RequestFailure ? error.code : undefined;
  if (code === "MAGIC_LINK_EXPIRED")
    return { heading: msg("auth.error.expired.heading"), body: msg("auth.error.expired.body") };
  if (code === "MAGIC_LINK_USED")
    return { heading: msg("auth.error.used.heading"), body: msg("auth.error.used.body") };
  if (code === "OIDC_PROVIDER_DENIED")
    return { heading: msg("auth.error.denied.heading"), body: msg("auth.error.denied.body") };
  if (code === "ACCOUNT_SUSPENDED")
    return { heading: msg("auth.error.suspended.heading"), body: msg("auth.error.suspended.body") };
  return { heading: msg("auth.error.heading"), body: msg("auth.error.body") };
}

export function SignInPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await requestMagicLink(email);
      navigate("/auth/check-email", { state: { requested: true } });
    } catch {
      setError(msg("auth.request.error"));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await startGoogle();
      globalThis.location.assign(result.authorizationUrl);
    } catch {
      setError(msg("auth.request.error"));
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <Card className="auth-card">
        <Badge tone="accent">{msg("auth.badge")}</Badge>
        <h1>{msg("auth.signin.heading")}</h1>
        <p>{msg("auth.signin.body")}</p>
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="auth-email">{msg("auth.email.label")}</label>
          <div className="auth-input">
            <Mail aria-hidden="true" />
            <input
              id="auth-email"
              autoComplete="email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder={msg("auth.email.placeholder")}
              required
              type="email"
              value={email}
            />
          </div>
          <Button disabled={busy} tone="accent" type="submit">
            <KeyRound aria-hidden="true" />
            {busy ? msg("auth.working") : msg("auth.magic.submit")}
          </Button>
        </form>
        <div className="auth-divider">
          <span>{msg("auth.or")}</span>
        </div>
        <Button disabled={busy} onClick={() => void google()} type="button">
          <ShieldCheck aria-hidden="true" />
          {msg("auth.google.submit")}
        </Button>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
      </Card>
    </AuthLayout>
  );
}

export function CheckEmailPage() {
  return (
    <AuthLayout>
      <Card className="auth-card auth-card--state">
        <Mail aria-hidden="true" className="auth-state-icon" />
        <h1>{msg("auth.check.heading")}</h1>
        <p>{msg("auth.check.body")}</p>
        <p>{msg("auth.check.security")}</p>
        <Link to="/auth/sign-in">{msg("auth.check.back")}</Link>
      </Card>
    </AuthLayout>
  );
}

function readFragment(name: string): string | undefined {
  const value = new URLSearchParams(globalThis.location.hash.slice(1)).get(name) ?? undefined;
  globalThis.history.replaceState(null, "", globalThis.location.pathname);
  return value;
}

function CallbackPage({ kind }: { readonly kind: "magic" | "google" }) {
  const navigate = useNavigate();
  const [credential] = useState(() => readFragment(kind === "magic" ? "token" : "result"));
  const [failure, setFailure] = useState<unknown>(() =>
    credential ? undefined : new Error(msg("auth.error.missing"))
  );

  useEffect(() => {
    if (!credential) return;
    const operation = kind === "magic" ? exchangeMagicLink(credential) : exchangeGoogle(credential);
    operation
      .then(({ returnTarget }) => navigate(returnTarget, { replace: true }))
      .catch(setFailure);
  }, [credential, kind, navigate]);

  if (!failure) {
    return (
      <AuthLayout>
        <Card className="auth-card auth-card--state">
          <Skeleton label={msg("auth.callback.loading")} />
          <h1>{msg("auth.callback.heading")}</h1>
          <p>{msg("auth.callback.body")}</p>
        </Card>
      </AuthLayout>
    );
  }
  const copy = failureCopy(failure);
  return (
    <AuthLayout>
      <div className="auth-card">
        <ErrorState title={copy.heading}>
          <p>{copy.body}</p>
          <Link to="/auth/sign-in">{msg("auth.error.retry")}</Link>
        </ErrorState>
      </div>
    </AuthLayout>
  );
}

export const MagicCallbackPage = () => <CallbackPage kind="magic" />;
export const GoogleCallbackPage = () => <CallbackPage kind="google" />;

export function AuthGate({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<"loading" | "ready" | "signed-out" | "suspended">("loading");
  useEffect(() => {
    fetchMeBootstrap()
      .then((bootstrap) => setState(bootstrap.user.status === "active" ? "ready" : "suspended"))
      .catch((error) =>
        setState(
          error instanceof RequestFailure && error.kind === "authorization"
            ? "suspended"
            : "signed-out"
        )
      );
  }, []);
  if (state === "loading")
    return (
      <div className="public-state">
        <Skeleton label={msg("auth.session.loading")} />
      </div>
    );
  if (state !== "ready") {
    return (
      <div className="public-state">
        <ErrorState
          title={
            state === "suspended"
              ? msg("auth.error.suspended.heading")
              : msg("state.unauthenticated.heading")
          }
        >
          <p>
            {state === "suspended"
              ? msg("auth.error.suspended.body")
              : msg("state.unauthenticated.body")}
          </p>
          <Link to="/auth/sign-in">{msg("auth.signin.action")}</Link>
        </ErrorState>
      </div>
    );
  }
  return children;
}

export function SessionsPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<readonly SessionSummary[]>();
  const [error, setError] = useState(false);
  const load = () =>
    fetchSessions()
      .then(setSessions)
      .catch(() => setError(true));
  useEffect(() => {
    void load();
  }, []);
  const revoke = async (session: SessionSummary) => {
    await revokeSession(session.id);
    if (session.current) navigate("/auth/sign-in", { replace: true });
    else await load();
  };
  const revokeOthers = async () => {
    await revokeOtherSessions();
    await load();
  };
  const signOut = async () => {
    await logout();
    navigate("/auth/sign-in", { replace: true });
  };
  return (
    <AuthGate>
      <main className="sessions-page">
        <Link to="/app/workflows">{msg("sessions.back")}</Link>
        <div className="sessions-heading">
          <div>
            <Badge tone="accent">{msg("sessions.badge")}</Badge>
            <h1>{msg("sessions.heading")}</h1>
            <p>{msg("sessions.body")}</p>
          </div>
          <div>
            <Button onClick={() => void revokeOthers()}>{msg("sessions.revoke.others")}</Button>
            <Button onClick={() => void signOut()}>
              <LogOut aria-hidden="true" />
              {msg("sessions.logout")}
            </Button>
          </div>
        </div>
        {error ? (
          <ErrorState title={msg("sessions.error.heading")}>
            <Button onClick={() => void load()}>{msg("app.error.retry")}</Button>
          </ErrorState>
        ) : null}
        {!sessions && !error ? <Skeleton label={msg("sessions.loading")} /> : null}
        <div className="session-list">
          {sessions?.map((session) => (
            <Card key={session.id} className="session-card">
              <Laptop aria-hidden="true" />
              <div>
                <strong>{session.deviceSummary}</strong>
                <span>
                  {session.current
                    ? msg("sessions.current")
                    : msg("sessions.last", { date: new Date(session.lastUsedAt).toLocaleString() })}
                </span>
              </div>
              {session.revokedAt ? (
                <Badge tone="danger">{msg("sessions.revoked")}</Badge>
              ) : (
                <Button onClick={() => void revoke(session)}>
                  {session.current ? msg("sessions.logout") : msg("sessions.revoke")}
                </Button>
              )}
            </Card>
          ))}
        </div>
      </main>
    </AuthGate>
  );
}

export function ProfilePage() {
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchProfile>>>();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetchProfile()
      .then(setProfile)
      .catch(() => setError(true));
  }, []);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    setError(false);
    try {
      setProfile(
        await updateProfile({
          displayName: profile.displayName,
          locale: profile.locale,
          timezone: profile.timezone
        })
      );
      setSaved(true);
    } catch {
      setError(true);
    }
  };
  return (
    <AuthGate>
      <main className="sessions-page profile-page">
        <Link to="/app/workflows">{msg("profile.back")}</Link>
        <div className="sessions-heading">
          <div>
            <Badge tone="accent">{msg("profile.badge")}</Badge>
            <h1>{msg("profile.heading")}</h1>
            <p>{msg("profile.body")}</p>
          </div>
          <Link to="/app/profile/sessions">{msg("profile.sessions")}</Link>
          <Link to="/app/profile/memory">{msg("memory.nav")}</Link>
        </div>
        {!profile && !error ? <Skeleton label={msg("profile.loading")} /> : null}
        {error && !profile ? (
          <ErrorState title={msg("profile.error")}>
            <Link to="/app/workflows">{msg("profile.back")}</Link>
          </ErrorState>
        ) : null}
        {profile ? (
          <Card className="profile-form-card">
            <form onSubmit={(event) => void save(event)}>
              <label htmlFor="profile-name">{msg("profile.name")}</label>
              <input
                id="profile-name"
                maxLength={160}
                onChange={(event) => setProfile({ ...profile, displayName: event.target.value })}
                required
                value={profile.displayName}
              />
              <label htmlFor="profile-email">{msg("profile.email")}</label>
              <input id="profile-email" disabled value={profile.email} />
              <label htmlFor="profile-locale">{msg("profile.locale")}</label>
              <select
                id="profile-locale"
                onChange={(event) => setProfile({ ...profile, locale: event.target.value })}
                value={profile.locale}
              >
                <option value="en">{msg("profile.locale.english")}</option>
              </select>
              <label htmlFor="profile-timezone">{msg("profile.timezone")}</label>
              <input
                id="profile-timezone"
                maxLength={80}
                onChange={(event) => setProfile({ ...profile, timezone: event.target.value })}
                required
                value={profile.timezone}
              />
              <Button tone="accent" type="submit">
                {msg("profile.save")}
              </Button>
              {saved ? <p role="status">{msg("profile.saved")}</p> : null}
              {error ? (
                <p className="auth-error" role="alert">
                  {msg("profile.error")}
                </p>
              ) : null}
            </form>
          </Card>
        ) : null}
      </main>
    </AuthGate>
  );
}
