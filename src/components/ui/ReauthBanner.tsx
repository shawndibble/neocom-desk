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
  /**
   * The banner *is* the view, so its button is the only thing on the page to
   * tap — `ScopeGate` replacing a locked route's whole body. Raises the action
   * to DESIGN.md §3's `md` touch tier (44px on a phone); everywhere else it
   * stays `sm`, the tier for a control sitting beside a view's own.
   *
   * Opt-in rather than keyed off `variant === 'primary'`: most of this
   * component's call sites are in-page secondary banners that never pass
   * `variant` at all and so inherit `primary` too. Keying off it would resize
   * all of them.
   */
  soleAction?: boolean;
}

export function ReauthBanner({
  title,
  hint,
  actionLabel,
  onLogin,
  variant = 'primary',
  soleAction = false,
}: ReauthBannerProps) {
  return (
    <div className="space-y-2 py-2">
      <p className="text-xs font-semibold tracking-widest text-warning uppercase">{title}</p>
      <p className="text-xs text-text-dim">{hint}</p>
      <Button variant={variant} size={soleAction ? 'md' : 'sm'} onClick={onLogin}>
        {actionLabel}
      </Button>
    </div>
  );
}
