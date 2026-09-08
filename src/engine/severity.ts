/**
 * How urgent a deadline is, derived from time remaining and nothing else.
 *
 * Lifted out of `engine/corp/board.ts`, where it was born, once the character's
 * Coming Up rail needed the same ladder. The corp ops board's own scope
 * decision requires "one `severityForRemaining` ladder, called by every
 * source" — two boards each carrying their own copy would satisfy the letter
 * of that and none of its point, because a threshold moved on one side would
 * never go red on the other.
 *
 * Nothing in here may branch on what kind of clock it is being asked about. A
 * structure with 25 days of fuel and a market order with 25 days to run are
 * the same urgency; which endpoint they came from is not an input.
 *
 * Pure (CLAUDE.md): a number in, a string out, no clock read here.
 */

/** Worst first — the order a legend lists them and a day's tone resolves in. */
export const DEADLINE_SEVERITIES = ['critical', 'warning', 'watch', 'clear'] as const;

export type DeadlineSeverity = (typeof DEADLINE_SEVERITIES)[number];

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const RANK: Record<DeadlineSeverity, number> = {
  critical: 0,
  warning: 1,
  watch: 2,
  clear: 3,
};

/**
 * `Array#sort` comparator putting the worst first — the Overview board ranks
 * its cards by it on a phone, where only about three fit above the fold.
 */
export function compareSeverity(a: DeadlineSeverity, b: DeadlineSeverity): number {
  return RANK[a] - RANK[b];
}

/**
 * The worst of several — what a card's header wears when it summarises the
 * rows beneath it.
 *
 * An empty list reads as `clear` rather than null: every caller is already
 * rendering something and needs a tone for it, and "nothing in here needs you"
 * is precisely what `clear` says. Returning null would push the same decision
 * out to each call site to make again.
 */
export function worstSeverity(severities: readonly DeadlineSeverity[]): DeadlineSeverity {
  let worst: DeadlineSeverity = 'clear';
  for (const severity of severities) {
    if (RANK[severity] < RANK[worst]) worst = severity;
  }
  return worst;
}

/**
 * `remainingMs` is deliberately **unclamped** by every caller: an overdue item
 * arrives as a negative, which is what keeps overdue items ordered against
 * each other instead of collapsing into one tie at zero. Clamping belongs at
 * the point of display.
 *
 * `null` means the clock exists but cannot be read right now — ESI drops
 * `fuel_expires` at exactly the moment a structure runs dry. Not knowing is a
 * caution, never an all-clear, so it answers `warning` rather than `clear`.
 */
export function severityForRemaining(remainingMs: number | null): DeadlineSeverity {
  if (remainingMs === null) return 'warning';
  if (remainingMs <= 24 * HOUR_MS) return 'critical';
  if (remainingMs <= 3 * DAY_MS) return 'warning';
  if (remainingMs <= 7 * DAY_MS) return 'watch';
  return 'clear';
}
