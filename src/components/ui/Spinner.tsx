export type SpinnerSize = 'sm' | 'md' | 'lg';

interface SpinnerProps {
  size?: SpinnerSize;
  label?: string;
  className?: string;
}

const SIZE: Record<SpinnerSize, string> = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-9',
};

export function Spinner({ size = 'md', label = 'Loading', className = '' }: SpinnerProps) {
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
