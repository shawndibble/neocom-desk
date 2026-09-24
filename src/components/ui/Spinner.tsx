import { useEffect, useState } from 'react';

export type SpinnerSize = 'sm' | 'md' | 'lg';

interface SpinnerProps {
  size?: SpinnerSize;
  label?: string;
  className?: string;
  /**
   * Hold the arc back for this long, so a load served from cache in a few ms
   * never flashes one. Until then a same-size, `aria-hidden` placeholder holds
   * the space (no `role="status"`, nothing announced, no shift when the arc
   * appears). Omit for an immediate spinner.
   */
  delayMs?: number;
}

const SIZE: Record<SpinnerSize, string> = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-9',
};

export function Spinner({ size = 'md', label = 'Loading', className = '', delayMs }: SpinnerProps) {
  const [shown, setShown] = useState(!delayMs);

  useEffect(() => {
    if (!delayMs) return;
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  if (!shown) {
    return <span aria-hidden="true" className={`inline-flex ${SIZE[size]} ${className}`} />;
  }

  return (
    <span role="status" aria-label={label} className={`inline-flex ${className}`}>
      <svg viewBox="0 0 24 24" fill="none" className={`animate-spin text-accent ${SIZE[size]}`}>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
        <path
          d="M22 12a10 10 0 0 0-10-10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
