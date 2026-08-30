import { Button } from './Button';

interface ReauthBannerProps {
  title: string;
  hint: string;
  actionLabel: string;
  onLogin: () => void;
  /**
   * `primary` when the banner replaces a view's content. `ghost` where it
   * renders alongside a view that has its own primary button — docs/DESIGN.md
   * §5 allows one per view.
   */
  variant?: 'primary' | 'ghost';
}

export function ReauthBanner({
  title,
  hint,
  actionLabel,
  onLogin,
  variant = 'primary',
}: ReauthBannerProps) {
  return (
    <div className="space-y-2 py-2">
      <p className="text-xs font-semibold tracking-widest text-warning uppercase">{title}</p>
      <p className="text-xs text-text-dim">{hint}</p>
      <Button variant={variant} size="sm" onClick={onLogin}>
        {actionLabel}
      </Button>
    </div>
  );
}
