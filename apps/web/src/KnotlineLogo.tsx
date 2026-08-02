type KnotlineMarkProps = {
  readonly className?: string;
  readonly size?: number;
  readonly title?: string;
};

/**
 * Knotline's master symbol: a stable operating line joined by one continuous,
 * returning thread. Keep the geometry synchronized with the public SVG assets.
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
      <path d="M10 6.5v35" stroke="currentColor" strokeLinecap="round" strokeWidth="5" />
      <path
        d="M10 24c7.2 0 9.4-5.3 13.1-10.1 3.3-4.3 7.2-7.1 11-5.5 5.1 2.1 4.7 8.7.6 11.7-2.7 2-6.2 3.2-11.6 3.9 5.9.7 10 2.3 12.5 5.5 3.3 4.3 1.5 10.2-3.1 10.6-3.7.3-6.4-3.4-9.5-7.5L16 24.2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      />
      <circle cx="10" cy="24" fill="currentColor" r="3.1" />
    </svg>
  );
}
