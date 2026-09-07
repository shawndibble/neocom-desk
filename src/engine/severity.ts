/**
 * The app's one four-rung urgency ladder.
 *
 * It started life as `CorpBoardSeverity` in `engine/corp/board.ts` and was
 * always general: the Overview board asks exactly the same question of a
 * colony, an order and a notification that the corp board asks of a fuel
 * timer. Lifted here so the two cannot drift into two ladders — and so the
 * one shared renderer (`components/ui/SeverityIcon.tsx`) has a type to take
 * that does not drag the corp engine into every view that needs a tone.
 *
 * `clear` deliberately carries the dim text colour rather than `success`
 * (DESIGN.md §6): a colony with two days left is not an achievement, it is
 * simply not today's problem. Colour is never the only signal — every rung
 * has its own glyph too.
 *
 * Pure: no fetch/DOM/Dexie, no clock.
 */

/** Worst first, so an index into this list *is* the rank. */
export const BOARD_SEVERITIES = ['critical', 'warning', 'watch', 'clear'] as const;

export type BoardSeverity = (typeof BOARD_SEVERITIES)[number];

const RANK: Record<BoardSeverity, number> = {
  critical: 0,
  warning: 1,
  watch: 2,
  clear: 3,
};

/** `Array#sort` comparator putting the worst first. */
export function compareSeverity(a: BoardSeverity, b: BoardSeverity): number {
  return RANK[a] - RANK[b];
}

/**
 * The worst of several — what a card's own header wears when it summarises
 * the rows under it.
 *
 * An empty list reads as `clear` rather than null: every caller is already
 * rendering something and needs a tone for it, and "nothing in here needs
 * you" is precisely what `clear` says. Returning null would push that same
 * decision out to each call site to make again.
 */
export function worstSeverity(severities: readonly BoardSeverity[]): BoardSeverity {
  let worst: BoardSeverity = 'clear';
  for (const severity of severities) {
    if (RANK[severity] < RANK[worst]) worst = severity;
  }
  return worst;
}
