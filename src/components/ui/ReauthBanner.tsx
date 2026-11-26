import { Button } from './Button';
import { NeedsConnection } from './NeedsConnection';

interface ReauthBannerProps {
  title: string;
  hint?: string;
  actionLabel: string;
  onLogin: () => void;
  variant?: 'primary' | 'ghost';
  soleAction?: boolean;
  compact?: boolean;
}

export function ReauthBanner({
  title,
  hint,
  actionLabel,
  onLogin,
  variant = 'primary',
  soleAction = false,
  compact = false,
}: ReauthBannerProps) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xs border border-line px-3 py-1.5">
        <p className="min-w-0 flex-1 text-xs">
          <span className="font-semibold text-warning">{title}</span>
          {hint && <span className="text-text-dim"> {hint}</span>}
        </p>
        <NeedsConnection>
          <Button variant="ghost" size="sm" onClick={onLogin}>
            {actionLabel}
          </Button>
        </NeedsConnection>
      </div>
    );
  }
  return (
    <div className="space-y-2 py-2">
      <p className="text-xs font-semibold tracking-widest text-warning uppercase">{title}</p>
      {hint && <p className="text-xs text-text-dim">{hint}</p>}
      <NeedsConnection>
        <Button variant={variant} size={soleAction ? 'md' : 'sm'} onClick={onLogin}>
          {actionLabel}
        </Button>
      </NeedsConnection>
    </div>
  );
}
