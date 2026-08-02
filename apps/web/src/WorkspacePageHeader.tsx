import type { ReactNode } from "react";

import "./WorkspacePageHeader.css";

export function WorkspacePageHeader({
  actions,
  className = "",
  description,
  eyebrow,
  headingId,
  title
}: {
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly description: ReactNode;
  readonly eyebrow: ReactNode;
  readonly headingId?: string;
  readonly title: ReactNode;
}) {
  return (
    <header className={`workspace-page-header ${className}`.trim()}>
      <div className="workspace-page-header__copy">
        <span className="workspace-page-header__eyebrow">{eyebrow}</span>
        <h1 id={headingId}>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="workspace-page-header__actions">{actions}</div> : null}
    </header>
  );
}
