import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "@knotline/ui";
import {
  Bell,
  CheckCheck,
  ExternalLink,
  LockKeyhole,
  Mail,
  MessageSquare,
  Webhook
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  fetchNotificationPreferences,
  fetchNotifications,
  fetchWorkspaceNotificationPolicy,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences,
  updateWorkspaceNotificationPolicy,
  type NotificationItem,
  type NotificationPreference
} from "./api.js";
import { msg } from "./i18n.js";
import "./M27Pages.css";

export function NotificationCenterPage() {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [items, setItems] = useState<readonly NotificationItem[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setBusy(true);
    try {
      setItems(await fetchNotifications(filter));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("notifications.error"));
    } finally {
      setBusy(false);
    }
  }, [filter]);
  useEffect(() => {
    let active = true;
    void fetchNotifications(filter)
      .then((next) => {
        if (active) {
          setItems(next);
          setError("");
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : msg("notifications.error"));
      })
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [filter]);
  const read = async (id: string) => {
    await markNotificationRead(id);
    await load();
  };
  const readAll = async () => {
    await markAllNotificationsRead();
    await load();
  };
  const groups = Map.groupBy(items, (item) => item.groupKey);
  return (
    <main className="page-shell notification-shell">
      <header className="notification-heading">
        <div>
          <Badge tone="accent">
            <Bell aria-hidden />
            {msg("notifications.badge")}
          </Badge>
          <h1>{msg("notifications.heading")}</h1>
          <p>{msg("notifications.body")}</p>
        </div>
        <Button disabled={!items.some((item) => !item.readAt)} onClick={() => void readAll()}>
          <CheckCheck aria-hidden />
          {msg("notifications.read.all")}
        </Button>
      </header>
      <nav className="notification-filters" aria-label={msg("notifications.filters")}>
        {(["all", "unread"] as const).map((value) => (
          <Button
            key={value}
            {...(filter === value ? { tone: "accent" as const } : {})}
            onClick={() => setFilter(value)}
          >
            {value === "all" ? msg("notifications.filter.all") : msg("notifications.filter.unread")}
          </Button>
        ))}
      </nav>
      {busy ? <Skeleton label={msg("notifications.loading")} /> : null}
      {error ? <ErrorState title={msg("notifications.error")}>{error}</ErrorState> : null}
      {!busy && !items.length ? (
        <EmptyState title={msg("notifications.empty")}>
          <p>{msg("notifications.empty.body")}</p>
        </EmptyState>
      ) : null}
      <div className="notification-groups">
        {[...groups.entries()].map(([group, entries]) => (
          <section key={group} aria-labelledby={`group-${group}`}>
            <h2 id={`group-${group}`}>
              {entries[0]?.title}
              <Badge tone="neutral">{entries.length}</Badge>
            </h2>
            {entries.map((item) => (
              <Card
                key={item.id}
                className={item.readAt ? "notification-read" : "notification-unread"}
              >
                <div className="notification-card">
                  <div>
                    <span className="notification-meta">
                      <Badge tone={item.priority === "critical" ? "danger" : "neutral"}>
                        {item.priority}
                      </Badge>
                      <time dateTime={item.createdAt}>
                        {new Date(item.createdAt).toLocaleString()}
                      </time>
                    </span>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                    {item.unavailableReason ? (
                      <p className="notification-unavailable">
                        <LockKeyhole aria-hidden />
                        {item.unavailableReason}
                      </p>
                    ) : null}
                  </div>
                  <div className="notification-actions">
                    {item.unavailableReason ? (
                      <Button disabled>{msg("notifications.unavailable")}</Button>
                    ) : (
                      <Link
                        className="kl-button is-accent is-md"
                        to={item.deepLink}
                        onClick={() => void read(item.id)}
                      >
                        {msg("notifications.open")}
                        <ExternalLink aria-hidden />
                      </Link>
                    )}
                    {!item.readAt ? (
                      <Button onClick={() => void read(item.id)}>
                        {msg("notifications.read.one")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}

const defaults: readonly Omit<NotificationPreference, "revision">[] = [
  {
    eventType: "task.assigned",
    channels: {
      in_app: "immediate",
      email: "daily_digest",
      slack: "off",
      teams: "off",
      webhook: "off"
    },
    quietStart: "22:00",
    quietEnd: "07:00",
    timeZone: "Asia/Kolkata",
    language: "en"
  },
  {
    eventType: "security.account_compromised",
    channels: {
      in_app: "immediate",
      email: "immediate",
      slack: "off",
      teams: "off",
      webhook: "off"
    },
    timeZone: "Asia/Kolkata",
    language: "en"
  }
];
export function NotificationSettingsPage() {
  const [preferences, setPreferences] = useState<readonly NotificationPreference[]>([]);
  const [policy, setPolicy] = useState<Readonly<Record<string, unknown>>>({});
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void Promise.all([fetchNotificationPreferences(), fetchWorkspaceNotificationPolicy()])
      .then(([next, workspace]) => {
        if (active) {
          setPreferences(next.length ? next : defaults.map((item) => ({ ...item, revision: 0 })));
          setPolicy(workspace);
        }
      })
      .catch(
        (cause: unknown) =>
          active &&
          setError(cause instanceof Error ? cause.message : msg("notification.settings.error"))
      )
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, []);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string, fallback: string) => {
        const value = form.get(name);
        return typeof value === "string" ? value : fallback;
      },
      timeZone = field("timeZone", "UTC"),
      quietStart = field("quietStart", "22:00"),
      quietEnd = field("quietEnd", "07:00");
    try {
      setError("");
      const next = preferences.map((item) => ({
        ...item,
        timeZone,
        quietStart,
        quietEnd,
        channels: {
          ...item.channels,
          email: field(`email:${item.eventType}`, item.channels.email || "off") as
            "immediate" | "daily_digest" | "weekly_digest" | "off"
        },
        expectedRevision: item.revision
      }));
      setPreferences(await updateNotificationPreferences(next));
      await updateWorkspaceNotificationPolicy({
        mandatoryEvents: policy.mandatoryEvents ?? [
          "security.account_compromised",
          "security.credential_revoked"
        ],
        escalationPolicy: policy.escalationPolicy ?? { criticalBypass: true },
        rateLimits: policy.rateLimits ?? { perUserPerHour: 100 },
        verifiedEmailDomain: policy.verifiedEmailDomain ?? null,
        replyPolicy: policy.replyPolicy ?? "no_reply",
        expectedRevision: policy.revision ?? 0
      });
      setStatus(msg("notification.settings.saved"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("notification.settings.error"));
    }
  };
  return (
    <main className="page-shell notification-shell">
      <header>
        <Badge tone="accent">
          <Bell aria-hidden />
          {msg("notification.settings.badge")}
        </Badge>
        <h1>{msg("notification.settings.heading")}</h1>
        <p>{msg("notification.settings.body")}</p>
      </header>
      {busy ? <Skeleton label={msg("notification.settings.loading")} /> : null}
      {error ? <ErrorState title={msg("notification.settings.error")}>{error}</ErrorState> : null}
      {status ? (
        <p role="status" className="notification-status">
          {status}
        </p>
      ) : null}
      <form className="preference-layout" onSubmit={(event) => void save(event)}>
        <section>
          <Card>
            <h2>{msg("notification.settings.schedule")}</h2>
            <div className="preference-fields">
              <label>
                {msg("notification.settings.timezone")}
                <input name="timeZone" defaultValue={preferences[0]?.timeZone ?? "Asia/Kolkata"} />
              </label>
              <label>
                {msg("notification.settings.quiet.start")}
                <input
                  name="quietStart"
                  type="time"
                  defaultValue={preferences[0]?.quietStart ?? "22:00"}
                />
              </label>
              <label>
                {msg("notification.settings.quiet.end")}
                <input
                  name="quietEnd"
                  type="time"
                  defaultValue={preferences[0]?.quietEnd ?? "07:00"}
                />
              </label>
            </div>
          </Card>
          <Card>
            <h2>{msg("notification.settings.events")}</h2>
            <div className="preference-table">
              {preferences.map((item) => (
                <div key={item.eventType} className="preference-row">
                  <span>
                    <strong>{item.eventType}</strong>
                    {item.eventType.startsWith("security.") ? (
                      <small>
                        <LockKeyhole aria-hidden />
                        {msg("notification.settings.mandatory")}
                      </small>
                    ) : null}
                  </span>
                  <label>
                    {msg("notification.settings.email")}
                    <select
                      name={`email:${item.eventType}`}
                      defaultValue={item.channels.email ?? "off"}
                      disabled={item.eventType.startsWith("security.")}
                    >
                      <option value="immediate">{msg("notification.cadence.immediate")}</option>
                      <option value="daily_digest">{msg("notification.cadence.daily")}</option>
                      <option value="weekly_digest">{msg("notification.cadence.weekly")}</option>
                      <option value="off">{msg("notification.cadence.off")}</option>
                    </select>
                  </label>
                </div>
              ))}
            </div>
          </Card>
          <Button tone="accent" type="submit">
            {msg("notification.settings.save")}
          </Button>
        </section>
        <aside>
          <Card>
            <h2>{msg("notification.settings.health")}</h2>
            <ul className="channel-health">
              <li>
                <Bell aria-hidden />
                <span>
                  <strong>{msg("notification.channel.inapp")}</strong>
                  <small>{msg("notification.channel.ready")}</small>
                </span>
                <Badge tone="success">{msg("notification.channel.live")}</Badge>
              </li>
              <li>
                <Mail aria-hidden />
                <span>
                  <strong>{msg("notification.channel.email")}</strong>
                  <small>{msg("notification.channel.email.gate")}</small>
                </span>
                <Badge tone="warning">{msg("notification.channel.recorded")}</Badge>
              </li>
              <li>
                <MessageSquare aria-hidden />
                <span>
                  <strong>{msg("notification.channel.chat")}</strong>
                  <small>{msg("notification.channel.chat.gates")}</small>
                </span>
                <Badge tone="warning">{msg("notification.channel.recorded")}</Badge>
              </li>
              <li>
                <Webhook aria-hidden />
                <span>
                  <strong>{msg("notification.channel.webhook")}</strong>
                  <small>{msg("notification.channel.signed")}</small>
                </span>
                <Badge tone="neutral">{msg("notification.channel.demo")}</Badge>
              </li>
            </ul>
          </Card>
          <Card>
            <h2>{msg("notification.settings.escalation")}</h2>
            <p>{msg("notification.settings.escalation.body")}</p>
          </Card>
        </aside>
      </form>
    </main>
  );
}
