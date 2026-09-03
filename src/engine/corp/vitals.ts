/**
 * The corp ops board's vitals rail: what the corporation holds, what it is
 * spending, and how long that lasts.
 *
 * Small on purpose. The board's ranking is the feature (`board.ts`); the rail
 * beside it answers one question the ranking cannot — whether the corporation
 * can still pay for the fuel and bills those clocks are counting down to.
 *
 * Pure (CLAUDE.md): `nowMs` is a parameter, ISK are plain numbers, and the
 * journal arrives already reduced to (instant, amount) pairs by
 * `features/corp/boardSources.ts`.
 */

/**
 * The window every rate on the rail is measured over.
 *
 * Thirty days because that is the cadence corporations actually run on — office
 * rent, structure fuel and market fees all land monthly — and because a shorter
 * window turns one large purchase into a burn rate that says the corporation
 * has a week to live.
 */
export const VITALS_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;
const WINDOW_MS = VITALS_WINDOW_DAYS * DAY_MS;

/** One wallet division's balance. Named by the divisions endpoint, at the view. */
export interface VitalsDivisionBalance {
  balance: number;
}

/** A journal line reduced to the two fields any rate here needs. */
export interface VitalsJournalEntry {
  atMs: number;
  /** Signed as ESI signs it: negative is money leaving the corporation. */
  amount: number;
}

/** Every readable division added up. */
export function totalBalance(divisions: readonly VitalsDivisionBalance[]): number {
  return divisions.reduce((sum, division) => sum + division.balance, 0);
}

/**
 * Entries inside the trailing window, and only those.
 *
 * Future-dated lines are dropped as well as old ones. ESI has been known to
 * carry a line stamped slightly ahead of the caller's clock, and a rate is a
 * claim about a period — letting an entry outside the period contribute would
 * make the denominator and the numerator disagree.
 */
function withinWindow(
  entries: readonly VitalsJournalEntry[],
  nowMs: number
): readonly VitalsJournalEntry[] {
  const from = nowMs - WINDOW_MS;
  return entries.filter((entry) => entry.atMs >= from && entry.atMs <= nowMs);
}

/** Income minus spending over the window — the rail's headline figure. */
export function netOverWindow(entries: readonly VitalsJournalEntry[], nowMs: number): number {
  return withinWindow(entries, nowMs).reduce((sum, entry) => sum + entry.amount, 0);
}

/**
 * Average ISK per day leaving the corporation, as a positive number.
 *
 * Spending only. A runway asks how long what is already banked will last, and
 * income is precisely the thing a runway must not assume keeps arriving — a
 * corporation whose net is positive because of one large sale still runs out of
 * fuel on schedule if that sale does not repeat.
 */
export function dailyOutgoings(entries: readonly VitalsJournalEntry[], nowMs: number): number {
  const spent = withinWindow(entries, nowMs)
    .filter((entry) => entry.amount < 0)
    .reduce((sum, entry) => sum + entry.amount, 0);
  // `Math.abs`, not unary minus: `spent` is zero or negative, and negating an
  // exact zero yields `-0` — a value that compares equal to 0 almost
  // everywhere except `Object.is`, and renders as "-0 ISK".
  return Math.abs(spent) / VITALS_WINDOW_DAYS;
}

/**
 * Days the balance covers at that rate, or `null` when the question has no
 * answer.
 *
 * `null` rather than a number in both directions, because both would be
 * fabrications: a corporation that has spent nothing has no burn rate to divide
 * by (and "unlimited" is not something the journal can support), and an empty
 * or overdrawn balance has no runway to report — a negative number of days is
 * not a shorter runway, it is a different situation. The rail says so instead
 * of printing a figure.
 */
export function runwayDays(balance: number, outgoingsPerDay: number): number | null {
  if (outgoingsPerDay <= 0 || balance <= 0) return null;
  return balance / outgoingsPerDay;
}
