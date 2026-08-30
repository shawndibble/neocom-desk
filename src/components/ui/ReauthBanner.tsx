import { Button } from './Button';

interface ReauthBannerProps {
  title: string;
  hint: string;
  actionLabel: string;
  onLogin: () => void;
  /**
   * `primary` is right when the banner replaces a view's content and is the
   * only call to action on screen. Pass `ghost` where it renders *alongside*
   * a view that still has its own primary button — docs/DESIGN.md §5 allows
   * one per view.
   */
  variant?: 'primary' | 'ghost';
}

/**
 * Shared "you need to log in again" affordance (BUG #3): same markup
 * src/features/industry/ActiveJobsPanel.tsx already used inline for its
 * `needsReauth` state, factored out so every read-through view that
 * distinguishes "not logged in" from "offline" can render it identically.
 */
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
