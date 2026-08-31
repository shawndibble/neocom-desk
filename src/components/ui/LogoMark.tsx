interface LogoMarkProps {
  className?: string;
}

/**
 * The NeoCom Desk hexagon mark, inline rather than an `<img>` so the corner
 * brackets track `--color-accent` instead of freezing whatever cyan the source
 * artwork happened to use. Simplified from `assets/brand/logo-mark.png`: the
 * bevels and the outer glow read as dirt below ~64px, which is every size this
 * component is used at.
 *
 * Decorative by default -- every placement so far sits beside the app name, so
 * a second accessible name would only be read out twice.
 */
export function LogoMark({ className = '' }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={`text-accent ${className}`}
    >
      <path
        d="M32 6 54.5 19 54.5 45 32 58 9.5 45 9.5 19Z"
        stroke="#cbd6e2"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M32 11 39 25 48 32 39 39 32 53 25 39 16 32 25 25Z" fill="#e6edf4" />
      {/* Reads as a hole, which is the point. `bg` rather than transparent so it
          stays dark on `panel` surfaces too, where the two differ by a shade. */}
      <path d="M32 28 36 32 32 36 28 32Z" fill="var(--color-bg)" />
      <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22.7 17.9 15.1 22.25 15.1 29" />
        <path d="M41.3 17.9 48.9 22.25 48.9 29" />
        <path d="M22.7 46.1 15.1 41.75 15.1 35" />
        <path d="M41.3 46.1 48.9 41.75 48.9 35" />
      </g>
    </svg>
  );
}
