interface LogoMarkProps {
  className?: string;
}

/**
 * The Neocom Desk hexagon mark, inline rather than an `<img>` so the corner
 * brackets track `--color-accent` instead of freezing whatever cyan the source
 * artwork happened to use. Simplified from `assets/brand/logo-mark.png`: the
 * bevels and the outer glow read as dirt below ~64px, which is every size this
 * component is used at.
 *
 * Simplified, not redrawn -- the geometry is the artwork's own, shared with
 * `public/icons/favicon.svg` so the tab strip and the app cannot show two
 * different marks. See that file for what each number is and which of them are
 * measured off the artwork (the shape) versus tuned for legibility at 16px
 * (the stroke widths). Change one file, change both.
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
        d="M32 6.05 53 19.2 53 44.8 32 57.95 11 44.8 11 19.2Z"
        stroke="#cbd6e2"
        strokeWidth="3"
        strokeLinejoin="miter"
      />
      <path
        d="M32 12 36.11 27.6 48.8 32 36.11 36.4 32 52 27.89 36.4 15.2 32 27.89 27.6Z"
        fill="#e6edf4"
      />
      {/* Reads as a hole, which is the point. `bg` rather than transparent so it
          stays dark on `panel` surfaces too, where the two differ by a shade.
          This is why the diamond is its own path here and an evenodd hole in
          favicon.svg, which has no surface behind it to match. */}
      <path d="M32 27.3 36.01 32 32 36.7 27.99 32Z" fill="var(--color-bg)" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="butt" strokeLinejoin="miter">
        <path d="M25.9 15.1 15.5 21.6 15.5 26.6" />
        <path d="M38.1 15.1 48.5 21.6 48.5 26.6" />
        <path d="M25.9 48.9 15.5 42.4 15.5 37.4" />
        <path d="M38.1 48.9 48.5 42.4 48.5 37.4" />
      </g>
    </svg>
  );
}
