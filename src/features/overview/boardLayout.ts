/**
 * Where each Overview card goes, given which ones are shown and how wide the
 * screen is — and which of their clocks leads the summary strip.
 *
 * The route declares every card once, as a spec, and everything positional is
 * derived here. Before this each card was wired into the grid, the phone's
 * full slots, the folded list, the deadline hero, the freshness badge and the
 * refresh spinner by hand, and a hidden card had to be filtered out of each of
 * those separately.
 */
import type { DeadlineSeverity } from '@/engine/severity';
import type { OverviewCardKey } from './hiddenCards';

export interface BoardDeadline {
  at: number;
  note: string;
  severity: DeadlineSeverity;
  to: string;
}

export interface BoardCardSpec {
  key: OverviewCardKey;
  /**
   * - `card`: a slot in the grid, placed by the pilot's order.
   * - `column`: Alerts. Beside the grid on desktop, first folded row on a phone.
   */
  placement: 'card' | 'column';
  /** Null while the card is still loading. Tones its folded row; never reorders anything. */
  severity: DeadlineSeverity | null;
  /** False when this Character cannot read the domain at all (a corp card without roles). */
  available?: boolean;
  /** This card's soonest clock, for the summary strip's Next deadline. */
  deadline?: BoardDeadline | null;
}

export interface BoardLayout<T extends BoardCardSpec> {
  full: T[];
  folded: T[];
  column: T | null;
}

/**
 * The pilot's order (`cardOrder.ts`) decides everything positional: the
 * desktop grid, and on a phone which cards keep their full shape — the first
 * `phoneFullCount` in it, whatever is on fire (the pilot chose that over
 * urgency ranking). The rest fold to a line under "Everything else", Alerts
 * first, because on a phone it has no column to sit in.
 */
export function layoutBoard<T extends BoardCardSpec>(
  specs: readonly T[],
  {
    isPhone,
    shown,
    phoneFullCount,
    order,
  }: {
    isPhone: boolean;
    shown: (key: OverviewCardKey) => boolean;
    phoneFullCount: number;
    order: readonly OverviewCardKey[];
  }
): BoardLayout<T> {
  const visible = specs.filter((spec) => spec.available !== false && shown(spec.key));
  const rank = (key: OverviewCardKey) => {
    const index = order.indexOf(key);
    return index < 0 ? order.length : index;
  };
  const cards = visible
    .filter((spec) => spec.placement === 'card')
    .sort((a, b) => rank(a.key) - rank(b.key));
  const column = visible.find((spec) => spec.placement === 'column') ?? null;
  if (!isPhone) return { full: cards, folded: [], column };
  return {
    full: cards.slice(0, phoneFullCount),
    folded: [...(column ? [column] : []), ...cards.slice(phoneFullCount)],
    column: null,
  };
}

/**
 * The soonest clock among the shown cards plus `always` (clocks that belong
 * to no card, like skill training). A hidden card contributes nothing: the
 * hero links to the card that owns its clock, and that link would land on
 * nothing.
 */
export function soonestDeadline(
  specs: readonly BoardCardSpec[],
  shown: (key: OverviewCardKey) => boolean,
  always: readonly BoardDeadline[]
): BoardDeadline | null {
  const candidates = [
    ...always,
    ...specs
      .filter((spec) => spec.available !== false && shown(spec.key))
      .flatMap((spec) => (spec.deadline ? [spec.deadline] : [])),
  ];
  return candidates.reduce<BoardDeadline | null>(
    (soonest, deadline) => (soonest === null || deadline.at < soonest.at ? deadline : soonest),
    null
  );
}
