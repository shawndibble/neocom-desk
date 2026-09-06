/**
 * Order Health: everything about one open market order that is not about
 * competition — how long it has left to run, and how long its remaining
 * stock will take to sell. Competition (who is beating whose price, and
 * where) is a separate concern owned by `undercut.ts`/`orderFloor.ts`; this
 * module never imports them and takes only plain primitives, so it stays
 * testable and reusable without a whole order-book fixture.
 *
 * ESI's own order shape drives the two traps this module exists to avoid:
 *
 * 1. `issued` is an ISO string and `duration` is in *days*, not the
 *    `expiry` timestamp a caller might expect. A malformed or missing pair
 *    must never silently compute as "expires now" — that would render every
 *    broken payload as the single scariest possible state ("expired today"),
 *    which is worse than surfacing nothing. `orderExpiry` returns `null` for
 *    any input it cannot trust, so the caller can render "unknown" instead
 *    of a false alarm.
 *
 * 2. "Will this stock sell before the order lapses?" only has an honest
 *    answer when something is actually moving. Dividing remaining volume by
 *    a zero rate produces `Infinity`, and multiplying by a zero market share
 *    produces the same trap — both look like "never" but actually mean
 *    "cannot tell, there's no data to divide by". `sellThrough` refuses to
 *    manufacture a number in that case: it returns a tagged `'unknown'`
 *    result instead, so a quiet market and a genuinely slow seller are never
 *    confused with a number the UI would otherwise present as gospel.
 */

/** Whole days in milliseconds, used to convert ESI's `duration` (days) to ms. */
const DAY_MS = 24 * 60 * 60 * 1000;

export interface OrderExpiry {
  /** Epoch ms the order lapses. */
  expiresAt: number;
  /** Whole days from `now` until then; negative once lapsed. */
  daysLeft: number;
  expired: boolean;
}

/**
 * ESI gives `issued` as an ISO string and `duration` in DAYS.
 *
 * Returns `null` for an unparseable `issued` or a non-finite/negative
 * `durationDays` — a bad payload must never render as "expired today".
 * `daysLeft` truncates toward zero (via `Math.trunc`) so a future date never
 * rounds up into a day the order does not actually have left.
 */
export function orderExpiry(issued: string, durationDays: number, now: number): OrderExpiry | null {
  const issuedMs = Date.parse(issued);
  if (Number.isNaN(issuedMs)) return null;
  if (!Number.isFinite(durationDays) || durationDays < 0) return null;

  const expiresAt = issuedMs + durationDays * DAY_MS;
  const daysLeft = Math.trunc((expiresAt - now) / DAY_MS);

  return { expiresAt, daysLeft, expired: expiresAt <= now };
}

export type SellThrough =
  | { kind: 'known'; unitsPerDay: number; daysToClear: number }
  | { kind: 'unknown'; reason: 'noSales' | 'noHistory' };

export interface SellThroughInputs {
  volumeRemain: number;
  /** Average units of this item traded per day in the region, from price history. */
  regionUnitsPerDay: number;
  /** 0..1 — the player's share of the units listed at their price or better. */
  myShare: number;
  /** False when there is no usable price history at all (not merely a quiet market). */
  hasHistory?: boolean;
}

/**
 * `volumeRemain / (regionUnitsPerDay * myShare)`.
 *
 * `myShare` is clamped into (0, 1] first: a share at or below zero means
 * nobody is buying at the player's price, which is indistinguishable from
 * "no sales" for this purpose. A resulting rate of zero (from either input)
 * answers `'noSales'`; `hasHistory === false` — no usable price history at
 * all, not merely a quiet market — answers `'noHistory'` and takes
 * precedence, checked first below.
 *
 * `daysToClear` rounds up (a part-day still needs that day); `unitsPerDay`
 * is reported unrounded so downstream math does not compound the rounding.
 */
export function sellThrough(inputs: SellThroughInputs): SellThrough {
  const { volumeRemain, regionUnitsPerDay, hasHistory } = inputs;

  if (hasHistory === false) return { kind: 'unknown', reason: 'noHistory' };

  const myShare = Math.min(1, Math.max(0, inputs.myShare));
  const unitsPerDay = regionUnitsPerDay * myShare;

  if (unitsPerDay === 0) return { kind: 'unknown', reason: 'noSales' };

  return { kind: 'known', unitsPerDay, daysToClear: Math.ceil(volumeRemain / unitsPerDay) };
}
