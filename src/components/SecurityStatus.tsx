/**
 * A solar system's security status on the game's own scale, colored per
 * `securityStatusColor`. The number is always spelled out rather than reduced
 * to a coloured dot — DESIGN.md §7, colour is never the only signal.
 *
 * Rounded through `shownSecurity` before display, not the raw ESI float:
 * that is the number the game itself shows and enforces (`securityStatus.ts`).
 *
 * Deliberately minimal — no null/undefined handling, no title, no translate —
 * so item-offer locations (`offerLocations.ts`) can use it without dragging in
 * assets-specific copy. `assetBrowserRows.tsx`'s own `SecurityValue` renders
 * an undecided/unresolvable state and an aria-label this component does not,
 * so it stays separate rather than wrapping this one.
 */
import { securityStatusColor, shownSecurity } from '@/engine/securityStatus';
import { cx } from '@/lib/cx';

export interface SecurityStatusProps {
  security: number;
  className?: string;
}

export function SecurityStatus({ security, className }: SecurityStatusProps) {
  return (
    <span
      className={cx('font-semibold tabular-nums', className)}
      style={{ color: securityStatusColor(security) }}
    >
      {shownSecurity(security).toFixed(1)}
    </span>
  );
}
