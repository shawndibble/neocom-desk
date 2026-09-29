/**
 * Where each Overview card goes, given which ones are shown and how wide the
 * screen is — and which of their clocks leads the summary strip.
 *
 * The route declares every card once, as a spec, and everything positional is
 * derived here. Before this each card was wired into the grid, the phone's
 * ranking, the folded list, the deadline hero, the freshness badge and the
 * refresh spinner by hand, and a hidden card had to be filtered out of each of
 * those separately.
 */
import { compareSeverity, type DeadlineSeverity } from '@/engine/severity';
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
   * - `ranked`: competes on severity for a phone's full-card slots.
   * - `folded`: always one line on a phone — a domain whose news fits in one
   *   (a courier, an unread count) must not take a card from a real deadline.
   * - `column`: Alerts. Beside the grid on desktop, first folded row on a phone.
   *
   * On desktop every placement but `column` renders in the grid, in
   * declaration order, so a card stays where it was between visits.
   */
  placement: 'ranked' | 'folded' | 'column';
  /** Null while the card is still loading — it sorts last rather than guessing. */
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

export function layoutBoard<T extends BoardCardSpec>(
  specs: readonly T[],
  {
    isPhone,
    shown,
    phoneFullCount,
  }: { isPhone: boolean; shown: (key: OverviewCardKey) => boolean; phoneFullCount: number }
): BoardLayout<T> {
  const visible = specs.filter((spec) => spec.available !== false && shown(spec.key));
  if (!isPhone) {
    return {
      full: visible.filter((spec) => spec.placement !== 'column'),
      folded: [],
      column: visible.find((spec) => spec.placement === 'column') ?? null,
    };
  }
  const ranked = visible
    .filter((spec) => spec.placement === 'ranked')
    .sort((a, b) =>
      a.severity === null || b.severity === null
        ? Number(a.severity === null) - Number(b.severity === null)
        : compareSeverity(a.severity, b.severity)
    );
  return {
    full: ranked.slice(0, phoneFullCount),
    folded: [
      ...visible.filter((spec) => spec.placement === 'column'),
      ...visible.filter((spec) => spec.placement === 'folded'),
      ...ranked.slice(phoneFullCount),
    ],
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
