/* eslint-disable knotline/no-hardcoded-user-visible-string -- Product copy is colocated while the profile catalog is finalized. */
import { Badge, Button, Card, ErrorState, Skeleton } from "@knotline/ui";
import {
  Bell,
  Check,
  ChevronRight,
  Clock3,
  Database,
  Globe2,
  Languages,
  Laptop,
  LogOut,
  MailCheck,
  MonitorCog,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserRound
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";

import {
  fetchMeBootstrap,
  fetchProfile,
  fetchSessions,
  logout,
  revokeOtherSessions,
  revokeSession,
  updateProfile,
  type MeBootstrap,
  type SessionSummary
} from "./api.js";
import {
  readInterfacePreferences,
  writeInterfacePreferences,
  type InterfacePreferences
} from "./profilePreferences.js";
import { RequestFailure } from "./query/errors.js";
import { WorkspaceShell } from "./WorkspaceShell.js";
import "./M04ProfilePages.css";

type Profile = MeBootstrap["user"];

const profileNavigation = [
  { label: "Profile", icon: UserRound, to: "/app/profile", end: true },
  { label: "Sessions & security", icon: ShieldCheck, to: "/app/profile/sessions", end: false },
  { label: "Notifications", icon: Bell, to: "/app/settings/notifications", end: false },
  { label: "Private memory", icon: Database, to: "/app/profile/memory", end: false }
] as const;

const commonTimezones = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland"
] as const;

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "U";

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof RequestFailure ? error.message : fallback;

export function ProfileShell({ children }: { readonly children: ReactNode }) {
  return (
    <WorkspaceShell contentClassName="profile-shell-content">
      <div className="profile-frame">
        <aside aria-label="Account settings" className="profile-settings-nav">
          <p className="profile-settings-nav__label">Personal settings</p>
          <nav>
            {profileNavigation.map(({ label, icon: Icon, to, end }) => (
              <NavLink
                className={({ isActive }) =>
                  isActive
                    ? "profile-settings-nav__item profile-settings-nav__item--active"
                    : "profile-settings-nav__item"
                }
                end={end}
                key={to}
                to={to}
              >
                <Icon aria-hidden="true" size={17} />
                <span>{label}</span>
                <ChevronRight
                  aria-hidden="true"
                  className="profile-settings-nav__chevron"
                  size={15}
                />
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="profile-surface">{children}</div>
      </div>
    </WorkspaceShell>
  );
}

function ProfileHeader({ profile }: { readonly profile: Profile }) {
  return (
    <header className="profile-hero">
      <span aria-hidden="true" className="profile-hero__avatar">
        {initials(profile.displayName)}
      </span>
      <div>
        <div className="profile-hero__eyebrow">
          <span>Personal account</span>
          <Badge tone="success">
            <Check aria-hidden="true" size={13} /> Active
          </Badge>
        </div>
        <h1>{profile.displayName}</h1>
        <p>{profile.email}</p>
      </div>
    </header>
  );
}

function PreferenceChoice<T extends string>({
  label,
  options,
  value,
  onChange
}: {
  readonly label: string;
  readonly options: readonly { value: T; label: string; detail: string }[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}) {
  return (
    <fieldset className="profile-choice">
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button
            aria-pressed={value === option.value}
            className={
              value === option.value
                ? "profile-choice__option profile-choice__option--active"
                : "profile-choice__option"
            }
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            <strong>{option.label}</strong>
            <span>{option.detail}</span>
            {value === option.value ? <Check aria-hidden="true" size={16} /> : null}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function ProfilePage() {
  const [profile, setProfile] = useState<Profile>();
  const [draft, setDraft] = useState<Profile>();
  const [preferences, setPreferences] = useState<InterfacePreferences>(() =>
    readInterfacePreferences()
  );
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    return fetchProfile()
      .then((next) => {
        setProfile(next);
        setDraft(next);
      })
      .catch((cause: unknown) => setError(errorMessage(cause, "We couldn’t load your profile.")));
  }, []);

  useEffect(() => void load(), [load]);
  const dirty = Boolean(
    profile &&
    draft &&
    (profile.displayName !== draft.displayName ||
      profile.locale !== draft.locale ||
      profile.timezone !== draft.timezone)
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    globalThis.addEventListener("beforeunload", warn);
    return () => globalThis.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || !draft.displayName.trim()) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const saved = await updateProfile({
        displayName: draft.displayName.trim(),
        locale: draft.locale,
        timezone: draft.timezone.trim()
      });
      setProfile(saved);
      setDraft(saved);
      setNotice("Your profile has been updated.");
      globalThis.dispatchEvent(new CustomEvent("knotline:profile-updated", { detail: saved }));
    } catch (cause) {
      setError(errorMessage(cause, "We couldn’t save your changes. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const saveInterfacePreference = (next: InterfacePreferences) => {
    setPreferences(next);
    writeInterfacePreferences(next);
    setNotice("Interface preferences saved on this device.");
  };

  return (
    <ProfileShell>
      {!profile || !draft ? (
        error ? (
          <ErrorState title="Profile unavailable">
            <p>{error}</p>
            <Button onClick={() => void load()}>Try again</Button>
          </ErrorState>
        ) : (
          <Skeleton label="Loading your profile" />
        )
      ) : (
        <>
          <ProfileHeader profile={profile} />
          <div aria-live="polite" className="profile-feedback">
            {notice ? (
              <p className="profile-feedback--success">
                <Check aria-hidden="true" size={16} />
                {notice}
              </p>
            ) : null}
            {error ? (
              <p className="profile-feedback--error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className="profile-columns">
            <section className="profile-column" aria-labelledby="identity-heading">
              <Card className="profile-card">
                <div className="profile-card__heading">
                  <span>
                    <UserRound aria-hidden="true" />
                  </span>
                  <div>
                    <h2 id="identity-heading">Profile information</h2>
                    <p>How teammates recognize you across Knotline.</p>
                  </div>
                </div>
                <form className="profile-form" onSubmit={(event) => void save(event)}>
                  <label htmlFor="profile-display-name">Display name</label>
                  <input
                    autoComplete="name"
                    id="profile-display-name"
                    maxLength={160}
                    onChange={(event) => {
                      setDraft({ ...draft, displayName: event.currentTarget.value });
                      setNotice("");
                    }}
                    required
                    value={draft.displayName}
                  />
                  <span className="profile-field-note">
                    Used in assignments, approvals, activity, and mentions.
                  </span>

                  <label htmlFor="profile-email">Email address</label>
                  <div className="profile-verified-field">
                    <input id="profile-email" readOnly value={draft.email} />
                    <span>
                      <MailCheck aria-hidden="true" size={15} /> Verified
                    </span>
                  </div>
                  <span className="profile-field-note">
                    Your sign-in identity is managed by your verified provider.
                  </span>

                  <div className="profile-form__split">
                    <label>
                      <span>
                        <Languages aria-hidden="true" size={15} /> Language
                      </span>
                      <select
                        onChange={(event) =>
                          setDraft({ ...draft, locale: event.currentTarget.value })
                        }
                        value={draft.locale}
                      >
                        <option value="en">English</option>
                      </select>
                    </label>
                    <label>
                      <span>
                        <Globe2 aria-hidden="true" size={15} /> Timezone
                      </span>
                      <input
                        list="profile-timezones"
                        onChange={(event) =>
                          setDraft({ ...draft, timezone: event.currentTarget.value })
                        }
                        required
                        value={draft.timezone}
                      />
                      <datalist id="profile-timezones">
                        {commonTimezones.map((timezone) => (
                          <option key={timezone} value={timezone} />
                        ))}
                      </datalist>
                    </label>
                  </div>
                  <div className="profile-form__actions">
                    <Button disabled={!dirty || saving} tone="accent" type="submit">
                      {saving ? "Saving…" : "Save changes"}
                    </Button>
                    <button
                      className="profile-text-button"
                      disabled={!dirty || saving}
                      onClick={() => {
                        setDraft(profile);
                        setError("");
                        setNotice("");
                      }}
                      type="button"
                    >
                      <RotateCcw aria-hidden="true" size={15} /> Discard
                    </button>
                    {dirty ? <span>Unsaved changes</span> : null}
                  </div>
                </form>
              </Card>

              <Card className="profile-card">
                <div className="profile-card__heading">
                  <span>
                    <MonitorCog aria-hidden="true" />
                  </span>
                  <div>
                    <h2>Interface preferences</h2>
                    <p>Personalize this browser without changing the workspace for anyone else.</p>
                  </div>
                </div>
                <PreferenceChoice
                  label="Motion"
                  onChange={(motion) => saveInterfacePreference({ ...preferences, motion })}
                  options={[
                    { value: "system", label: "Use system setting", detail: "Follow this device" },
                    { value: "reduce", label: "Reduce motion", detail: "Minimize transitions" }
                  ]}
                  value={preferences.motion}
                />
                <PreferenceChoice
                  label="Contrast"
                  onChange={(contrast) => saveInterfacePreference({ ...preferences, contrast })}
                  options={[
                    { value: "standard", label: "Standard", detail: "Balanced contrast" },
                    { value: "high", label: "High contrast", detail: "Stronger boundaries" }
                  ]}
                  value={preferences.contrast}
                />
                <PreferenceChoice
                  label="Density"
                  onChange={(density) => saveInterfacePreference({ ...preferences, density })}
                  options={[
                    { value: "comfortable", label: "Comfortable", detail: "More breathing room" },
                    { value: "compact", label: "Compact", detail: "More content at once" }
                  ]}
                  value={preferences.density}
                />
              </Card>
            </section>

            <aside className="profile-column profile-column--aside">
              <Card className="profile-card profile-card--summary">
                <h2>Account overview</h2>
                <dl>
                  <div>
                    <dt>Account status</dt>
                    <dd>
                      <span className="profile-status-dot" />
                      Active
                    </dd>
                  </div>
                  <div>
                    <dt>Sign-in</dt>
                    <dd>Passwordless</dd>
                  </div>
                  <div>
                    <dt>Language</dt>
                    <dd>English</dd>
                  </div>
                  <div>
                    <dt>Timezone</dt>
                    <dd>{profile.timezone}</dd>
                  </div>
                </dl>
              </Card>
              <Link className="profile-action-card" to="/app/profile/sessions">
                <ShieldCheck aria-hidden="true" />
                <span>
                  <strong>Sessions & security</strong>
                  <small>Review devices and sign out remotely.</small>
                </span>
                <ChevronRight aria-hidden="true" />
              </Link>
              <Link className="profile-action-card" to="/app/settings/notifications">
                <Bell aria-hidden="true" />
                <span>
                  <strong>Notification preferences</strong>
                  <small>Choose delivery timing and quiet hours.</small>
                </span>
                <ChevronRight aria-hidden="true" />
              </Link>
              <Link className="profile-action-card" to="/app/profile/memory">
                <Sparkles aria-hidden="true" />
                <span>
                  <strong>Private memory</strong>
                  <small>Inspect, correct, export, or delete saved context.</small>
                </span>
                <ChevronRight aria-hidden="true" />
              </Link>
            </aside>
          </div>
        </>
      )}
    </ProfileShell>
  );
}

const relativeTime = (value: string) => {
  const delta = Date.now() - new Date(value).getTime();
  if (delta < 60_000) return "Just now";
  if (delta < 3_600_000) return `${Math.max(1, Math.floor(delta / 60_000))} minutes ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} hours ago`;
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
};

export function SessionsPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<readonly SessionSummary[]>();
  const [profile, setProfile] = useState<Profile>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [confirmId, setConfirmId] = useState("");

  const load = useCallback(
    () =>
      Promise.all([fetchSessions(), fetchMeBootstrap().then((result) => result.user)])
        .then(([nextSessions, nextProfile]) => {
          setSessions(nextSessions);
          setProfile(nextProfile);
        })
        .catch((cause: unknown) =>
          setError(errorMessage(cause, "We couldn’t load your active sessions."))
        ),
    []
  );
  useEffect(() => void load(), [load]);

  const activeSessions = useMemo(
    () => sessions?.filter((session) => !session.revokedAt) ?? [],
    [sessions]
  );
  const otherSessions = activeSessions.filter((session) => !session.current);

  const revoke = async (session: SessionSummary) => {
    setBusyId(session.id);
    setError("");
    try {
      await revokeSession(session.id);
      if (session.current) {
        navigate("/auth/sign-in", { replace: true });
        return;
      }
      setNotice(`${session.deviceSummary} has been signed out.`);
      setConfirmId("");
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "We couldn’t revoke that session."));
    } finally {
      setBusyId("");
    }
  };

  const revokeOthers = async () => {
    setBusyId("others");
    setError("");
    try {
      const result = await revokeOtherSessions();
      setNotice(
        `${result.revoked} other ${result.revoked === 1 ? "session" : "sessions"} signed out.`
      );
      setConfirmId("");
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "We couldn’t sign out the other sessions."));
    } finally {
      setBusyId("");
    }
  };

  const signOut = async () => {
    setBusyId("current");
    try {
      await logout();
      navigate("/auth/sign-in", { replace: true });
    } catch (cause) {
      setError(errorMessage(cause, "We couldn’t sign you out."));
      setBusyId("");
    }
  };

  return (
    <ProfileShell>
      <header className="profile-page-heading">
        <div>
          <span className="profile-page-heading__icon">
            <ShieldCheck aria-hidden="true" />
          </span>
          <div>
            <p>Personal security</p>
            <h1>Sessions & security</h1>
            <span>Review where you’re signed in and remove access you don’t recognize.</span>
          </div>
        </div>
        <Button
          onClick={() => {
            setConfirmId("current");
            setNotice("");
          }}
        >
          <LogOut aria-hidden="true" /> Sign out
        </Button>
      </header>
      {error ? (
        <p className="profile-feedback--error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="profile-feedback--success" role="status">
          <Check aria-hidden="true" size={16} />
          {notice}
        </p>
      ) : null}
      {confirmId === "current" ? (
        <Card className="profile-confirm">
          <div>
            <strong>Sign out of this device?</strong>
            <p>You’ll return to the secure sign-in page.</p>
          </div>
          <div>
            <Button disabled={busyId === "current"} onClick={() => void signOut()} tone="danger">
              {busyId === "current" ? "Signing out…" : "Yes, sign out"}
            </Button>
            <Button onClick={() => setConfirmId("")}>Cancel</Button>
          </div>
        </Card>
      ) : null}
      {!sessions || !profile ? (
        error ? (
          <Button onClick={() => void load()}>Try again</Button>
        ) : (
          <Skeleton label="Loading active sessions" />
        )
      ) : (
        <>
          <section aria-labelledby="session-summary-heading" className="session-summary-grid">
            <Card>
              <Laptop aria-hidden="true" />
              <div>
                <span id="session-summary-heading">Active sessions</span>
                <strong>{activeSessions.length}</strong>
                <small>Across your devices</small>
              </div>
            </Card>
            <Card>
              <Clock3 aria-hidden="true" />
              <div>
                <span>Most recent activity</span>
                <strong>
                  {relativeTime(activeSessions[0]?.lastUsedAt ?? new Date().toISOString())}
                </strong>
                <small>Session activity refreshes securely</small>
              </div>
            </Card>
            <Card>
              <MailCheck aria-hidden="true" />
              <div>
                <span>Verified identity</span>
                <strong>{profile.email}</strong>
                <small>Passwordless account</small>
              </div>
            </Card>
          </section>
          <section aria-labelledby="active-devices-heading" className="sessions-panel">
            <div className="sessions-panel__heading">
              <div>
                <h2 id="active-devices-heading">Active devices</h2>
                <p>Sessions expire automatically after inactivity or their absolute lifetime.</p>
              </div>
              {otherSessions.length ? (
                <Button onClick={() => setConfirmId(confirmId === "others" ? "" : "others")}>
                  Sign out all other sessions
                </Button>
              ) : null}
            </div>
            {confirmId === "others" ? (
              <div className="sessions-inline-confirm">
                <span>
                  <strong>
                    Sign out {otherSessions.length} other{" "}
                    {otherSessions.length === 1 ? "session" : "sessions"}?
                  </strong>
                  <small>Your current device will stay signed in.</small>
                </span>
                <Button
                  disabled={busyId === "others"}
                  onClick={() => void revokeOthers()}
                  tone="danger"
                >
                  {busyId === "others" ? "Signing out…" : "Confirm"}
                </Button>
                <Button onClick={() => setConfirmId("")}>Cancel</Button>
              </div>
            ) : null}
            <div className="session-list-modern">
              {activeSessions.map((session) => (
                <article className="session-row-modern" key={session.id}>
                  <span className="session-row-modern__device">
                    <Laptop aria-hidden="true" />
                  </span>
                  <div className="session-row-modern__identity">
                    <strong>{session.deviceSummary}</strong>
                    <span>
                      {session.current
                        ? "This device · Active now"
                        : `Last active ${relativeTime(session.lastUsedAt)}`}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>Signed in</dt>
                      <dd>{new Date(session.issuedAt).toLocaleDateString()}</dd>
                    </div>
                    <div>
                      <dt>Expires</dt>
                      <dd>{new Date(session.absoluteExpiresAt).toLocaleDateString()}</dd>
                    </div>
                  </dl>
                  <div className="session-row-modern__action">
                    {session.current ? (
                      <Badge tone="success">Current session</Badge>
                    ) : confirmId === session.id ? (
                      <>
                        <Button
                          disabled={busyId === session.id}
                          onClick={() => void revoke(session)}
                          tone="danger"
                        >
                          {busyId === session.id ? "Revoking…" : "Confirm revoke"}
                        </Button>
                        <button
                          className="profile-text-button"
                          onClick={() => setConfirmId("")}
                          type="button"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <Button onClick={() => setConfirmId(session.id)}>Revoke</Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
          <Card className="security-note">
            <ShieldCheck aria-hidden="true" />
            <div>
              <strong>How Knotline protects your account</strong>
              <p>
                Sessions use protected, browser-inaccessible cookies and rotate server-side
                credentials. Revoking a session removes its access immediately.
              </p>
            </div>
          </Card>
        </>
      )}
    </ProfileShell>
  );
}
