type KnotlineMarkProps = {
  readonly className?: string;
  readonly size?: number;
  readonly title?: string;
};

/**
 * Knotline's master symbol: two opposing routes wrap around an accountable
 * center. Keep the geometry synchronized with the public assets.
 */
export function KnotlineMark({ className, size = 28, title }: KnotlineMarkProps) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
      fill="none"
      height={size}
      role={title ? "img" : undefined}
      viewBox="0 0 48 48"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M5 13h19c7 0 11 4 11 11v19"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="6"
      />
      <path
        d="M43 35H24c-7 0-11-4-11-11V5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="6"
      />
    </svg>
  );
}
