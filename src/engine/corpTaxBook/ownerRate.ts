/**
 * Owner rate: what a feeder is owed, a history of its own that
 * never enters the miner rate chain. The feeder may request a rate at any time
 * and the Collector may agree one; the agreed rate wins, so a request made
 * after an override is recorded and changes nothing. Dates are bare EVE/UTC
 * days; every entry applies from its effective-from day and never reaches back.
 */

export type OwnerRateKind = 'requested' | 'agreed';

export interface OwnerRateEntry {
  kind: OwnerRateKind;
  pct: number;
  /** First EVE/UTC day the rate applies to. */
  effectiveFrom: string;
  /** ISO instant the entry was recorded; breaks a tie between entries of one day. */
  recordedAt: string;
}

export interface EffectiveOwnerRate {
  pct: number;
  kind: OwnerRateKind;
  effectiveFrom: string;
}

/** The entry in effect for a day: latest effective-from on or before it, then latest recorded. */
function latestOf(
  history: readonly OwnerRateEntry[],
  kind: OwnerRateKind,
  date: string
): OwnerRateEntry | undefined {
  let best: OwnerRateEntry | undefined;
  for (const entry of history) {
    if (entry.kind !== kind || entry.effectiveFrom > date) continue;
    if (
      !best ||
      entry.effectiveFrom > best.effectiveFrom ||
      (entry.effectiveFrom === best.effectiveFrom && entry.recordedAt >= best.recordedAt)
    )
      best = entry;
  }
  return best;
}

/** The agreed rate in effect on `date` if one exists, else the requested one. */
export function effectiveOwnerRate(
  history: readonly OwnerRateEntry[],
  date: string
): EffectiveOwnerRate | undefined {
  const entry = latestOf(history, 'agreed', date) ?? latestOf(history, 'requested', date);
  return entry && { pct: entry.pct, kind: entry.kind, effectiveFrom: entry.effectiveFrom };
}

/** The feeder's own requested rate in effect on `date`, whatever was agreed. */
export function requestedOwnerRate(
  history: readonly OwnerRateEntry[],
  date: string
): number | undefined {
  return latestOf(history, 'requested', date)?.pct;
}

/** Miner rate minus owner rate, in percentage points. Computed on read, never stored. */
export function ownerMargin(
  minerPct: number | undefined,
  ownerPct: number | undefined
): number | undefined {
  if (minerPct === undefined || ownerPct === undefined) return undefined;
  return Math.round((minerPct - ownerPct) * 1e6) / 1e6;
}

/** The "rate changed" event the in-app notice and the mail consume. */
export interface OwnerRateChange {
  date: string;
  /** Absent when this is the first rate. */
  oldPct?: number;
  newPct: number;
  /** What the feeder asked for, when it asked. */
  requestedPct?: number;
}

/**
 * The change an edit made to the effective owner rate on `date`, or undefined
 * when the effective rate did not move (a request after an override, or an
 * agreement to what is already in force).
 */
export function rateChangeEvent(input: {
  before: readonly OwnerRateEntry[];
  after: readonly OwnerRateEntry[];
  date: string;
}): OwnerRateChange | undefined {
  const { before, after, date } = input;
  const next = effectiveOwnerRate(after, date);
  if (!next) return undefined;
  const previous = effectiveOwnerRate(before, date);
  if (previous?.pct === next.pct) return undefined;
  const requestedPct = requestedOwnerRate(after, date);
  return {
    date,
    ...(previous ? { oldPct: previous.pct } : {}),
    newPct: next.pct,
    ...(requestedPct !== undefined ? { requestedPct } : {}),
  };
}
