interface LogoMarkProps {
  className?: string;
}

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
