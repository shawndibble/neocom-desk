import { Button } from './Button';
import { NeedsConnection } from './NeedsConnection';

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
   * to DESIGN.md §3's `md` touch tier (36px on a phone); everywhere else it
   * stays `sm`, the tier for a control sitting beside a view's own.
   *
   * Opt-in rather than keyed off `variant === 'primary'`: most of this
   * component's call sites are in-page secondary banners that never pass
   * `variant` at all and so inherit `primary` too. Keying off it would resize
   * all of them.
   *
   * It moves the pointer-width height too, 28px to 36px (plus that tier's
   * padding and type scale), because the scale has no `h-9 md:h-7` rung and
   * DESIGN.md §3 forbids hand-writing one. 36px is what every other primary
   * button in the app already renders at on a pointer, so the sole CTA of a
   * locked route matching them is the outcome to want.
   */
  soleAction?: boolean;
  /**
   * One wrapped line — warning title, hint, ghost action — in a hairline box,
   * for a note that sits *beside* a view's saved data rather than replacing
   * it (a lapsed grant must not hide what is already on this device). The
   * full stacked banner stays for a view with nothing to show.
   */
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
          <span className="font-semibold text-warning">{title}</span>{' '}
          <span className="text-text-dim">{hint}</span>
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
      <p className="text-xs text-text-dim">{hint}</p>
      {/* Every caller's `onLogin` goes to EVE's SSO, which needs a connection. */}
      <NeedsConnection>
        <Button variant={variant} size={soleAction ? 'md' : 'sm'} onClick={onLogin}>
          {actionLabel}
        </Button>
      </NeedsConnection>
    </div>
  );
}
