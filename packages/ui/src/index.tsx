import {
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useEffect,
  useRef,
  useId
} from "react";

export * from "./i18n.js";

type Tone = "accent" | "danger" | "neutral" | "success" | "warning";
type Size = "sm" | "md" | "lg";

const classes = (...values: Array<string | false | undefined>): string =>
  values.filter(Boolean).join(" ");

export function Button({
  className,
  tone = "neutral",
  size = "md",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: Size }) {
  return (
    <button
      {...props}
      type={type}
      className={classes("kl-button", `is-${tone}`, `is-${size}`, className)}
    />
  );
}

export function Link({ className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} className={classes("kl-link", className)} />;
}

interface FieldProps {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
}

function Field({
  label,
  description,
  error,
  children
}: FieldProps & {
  children: (ids: { input: string; description: string; error: string }) => ReactNode;
}) {
  const input = useId();
  const descriptionId = `${input}-description`;
  const errorId = `${input}-error`;
  return (
    <label className="kl-field" htmlFor={input}>
      <span className="kl-field__label">{label}</span>
      {children({ input, description: descriptionId, error: errorId })}
      {description ? (
        <span id={descriptionId} className="kl-field__description">
          {description}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className="kl-field__error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

const describedBy = (
  description: ReactNode,
  error: ReactNode,
  ids: { description: string; error: string }
) =>
  [description ? ids.description : undefined, error ? ids.error : undefined]
    .filter(Boolean)
    .join(" ") || undefined;

export function Input({
  label,
  description,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & FieldProps) {
  return (
    <Field label={label} description={description} error={error}>
      {(ids) => (
        <input
          {...props}
          id={ids.input}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(description, error, ids)}
          className="kl-input"
        />
      )}
    </Field>
  );
}

export function Select({
  label,
  description,
  error,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & FieldProps) {
  return (
    <Field label={label} description={description} error={error}>
      {(ids) => (
        <select
          {...props}
          id={ids.input}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(description, error, ids)}
          className="kl-input"
        >
          {children}
        </select>
      )}
    </Field>
  );
}

export function Textarea({
  label,
  description,
  error,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps) {
  return (
    <Field label={label} description={description} error={error}>
      {(ids) => (
        <textarea
          {...props}
          id={ids.input}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(description, error, ids)}
          className="kl-input kl-textarea"
        />
      )}
    </Field>
  );
}

export const FileField = (props: InputHTMLAttributes<HTMLInputElement> & FieldProps) => (
  <Input {...props} type="file" />
);
export const Checkbox = (props: InputHTMLAttributes<HTMLInputElement> & FieldProps) => (
  <Input {...props} type="checkbox" className="kl-check" />
);
export const Radio = (props: InputHTMLAttributes<HTMLInputElement> & FieldProps) => (
  <Input {...props} type="radio" className="kl-check" />
);
export const Switch = ({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & FieldProps) => (
  <Input {...props} label={label} type="checkbox" role="switch" className="kl-switch" />
);

export function Combobox({
  label,
  options,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "list"> &
  FieldProps & { options: readonly string[] }) {
  const list = useId();
  return (
    <>
      <Input
        {...props}
        label={label}
        list={list}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={list}
        aria-expanded="false"
      />
      <datalist id={list}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  );
}

export function Dialog({
  open,
  title,
  children,
  onDismiss,
  labelledBy
}: {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  onDismiss: () => void;
  labelledBy?: string;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    (focusable ?? dialog)?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ];
      const first = items[0] ?? dialog;
      const last = items.at(-1) ?? dialog;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      returnFocusRef.current?.focus();
    };
  }, [onDismiss, open]);
  if (!open) return null;
  return (
    <div
      className="kl-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <section
        ref={dialogRef}
        className="kl-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? titleId}
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </section>
    </div>
  );
}

export const AlertDialog = (props: Parameters<typeof Dialog>[0]) => <Dialog {...props} />;
export const Sheet = ({
  className,
  ...props
}: Parameters<typeof Dialog>[0] & { className?: string }) => (
  <div className={classes("kl-sheet", className)}>
    <Dialog {...props} />
  </div>
);
export const Popover = ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div {...props} className={classes("kl-popover", props.className)}>
    {children}
  </div>
);
export const Tooltip = ({ content, children }: { content: ReactNode; children: ReactNode }) => (
  <span className="kl-tooltip" data-tooltip={typeof content === "string" ? content : undefined}>
    {children}
    <span role="tooltip">{content}</span>
  </span>
);
export const Menu = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="kl-menu" role="menu" aria-label={label}>
    {children}
  </div>
);

export function Tabs({
  label,
  tabs,
  active,
  onChange
}: {
  label: string;
  tabs: readonly { id: string; label: ReactNode; panel: ReactNode }[];
  active: string;
  onChange: (id: string) => void;
}) {
  const selected = tabs.find((tab) => tab.id === active) ?? tabs[0];
  return (
    <div>
      <div className="kl-tabs" role="tablist" aria-label={label}>
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            role="tab"
            aria-selected={tab.id === selected?.id}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>
      {selected ? <div role="tabpanel">{selected.panel}</div> : null}
    </div>
  );
}

export const Breadcrumb = ({ label, children }: { label: string; children: ReactNode }) => (
  <nav className="kl-breadcrumb" aria-label={label}>
    <ol>{children}</ol>
  </nav>
);
export const Toast = ({ children, urgent = false }: { children: ReactNode; urgent?: boolean }) => (
  <div className="kl-toast" role={urgent ? "alert" : "status"}>
    {children}
  </div>
);
export const Table = ({ children, ...props }: HTMLAttributes<HTMLTableElement>) => (
  <div className="kl-table-wrap">
    <table {...props}>{children}</table>
  </div>
);
export const Card = ({ className, ...props }: HTMLAttributes<HTMLElement>) => (
  <article {...props} className={classes("kl-card", className)} />
);
export const Badge = ({
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) => (
  <span {...props} className={classes("kl-badge", `is-${tone}`, props.className)} />
);
export const Skeleton = ({
  label,
  ...props
}: HTMLAttributes<HTMLDivElement> & { label: string }) => (
  <div
    {...props}
    className={classes("kl-skeleton", props.className)}
    role="status"
    aria-label={label}
  />
);
export const EmptyState = ({ title, children }: { title: ReactNode; children?: ReactNode }) => (
  <section className="kl-state">
    <h2>{title}</h2>
    {children}
  </section>
);
export const ErrorState = ({ title, children }: { title: ReactNode; children?: ReactNode }) => (
  <section className="kl-state is-error" role="alert">
    <h2>{title}</h2>
    {children}
  </section>
);

export function Pagination({
  page,
  pages,
  label,
  previousLabel,
  nextLabel,
  onChange
}: {
  page: number;
  pages: number;
  label: string;
  previousLabel: ReactNode;
  nextLabel: ReactNode;
  onChange: (page: number) => void;
}) {
  return (
    <nav className="kl-pagination" aria-label={label}>
      <Button disabled={page <= 1} onClick={() => onChange(page - 1)}>
        {previousLabel}
      </Button>
      <span aria-current="page">
        {page} / {pages}
      </span>
      <Button disabled={page >= pages} onClick={() => onChange(page + 1)}>
        {nextLabel}
      </Button>
    </nav>
  );
}

export function CommandPalette({
  open,
  title,
  queryLabel,
  query,
  onQuery,
  onDismiss,
  children
}: {
  open: boolean;
  title: ReactNode;
  queryLabel: ReactNode;
  query: string;
  onQuery: (query: string) => void;
  onDismiss: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} title={title} onDismiss={onDismiss}>
      <Input
        label={queryLabel}
        value={query}
        onChange={(event) => onQuery(event.currentTarget.value)}
        autoFocus
      />
      <div className="kl-command-results">{children}</div>
    </Dialog>
  );
}
