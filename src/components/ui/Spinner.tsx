import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePrefersReducedMotion } from '@/lib/useMediaQuery';

export type SpinnerSize = 'sm' | 'md' | 'lg';

interface SpinnerProps {
  size?: SpinnerSize;
  label?: string;
  className?: string;
  delayMs?: number;
  block?: 'page' | 'panel';
  showLabel?: boolean;
}

const SIZE: Record<SpinnerSize, string> = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-9',
};

const BLOCK_DELAY_MS = 200;

export function Spinner({ block, delayMs, ...props }: SpinnerProps) {
  const reducedMotion = usePrefersReducedMotion();
  if (!block) return <SpinnerArc {...props} delayMs={delayMs} />;
  return (
    <div className={block === 'page' ? 'flex justify-center py-16' : 'flex justify-center py-8'}>
      <SpinnerArc {...props} delayMs={delayMs ?? (reducedMotion ? undefined : BLOCK_DELAY_MS)} />
    </div>
  );
}

function SpinnerArc({
  size = 'md',
  label,
  className = '',
  delayMs,
  showLabel = false,
}: Omit<SpinnerProps, 'block'>) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(!delayMs);

  useEffect(() => {
    if (!delayMs) return;
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  if (!shown) {
    return <span aria-hidden="true" className={`inline-flex ${SIZE[size]} ${className}`} />;
  }

  const name = label ?? t('common.loading');
  return (
    <span
      role="status"
      aria-label={name}
      className={`inline-flex ${showLabel ? 'items-center gap-2' : ''} ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={`animate-spin text-accent motion-reduce:animate-[spin_2s_linear_infinite] ${SIZE[size]}`}
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
        <path
          d="M22 12a10 10 0 0 0-10-10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      {showLabel && (
        <span aria-hidden="true" className="text-text-dim">
          {name}
        </span>
      )}
    </span>
  );
}
