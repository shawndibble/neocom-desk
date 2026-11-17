/**
 * Owner rate: what a feeder is owed, a history of its own that
 * never enters the miner rate chain. The feeder may request a rate at any time
 * and the Collector may agree one; only an agreed rate is ever in effect, so a
 * request is recorded and changes nothing on its own (#6209). Dates are bare
 * EVE/UTC days; an agreed entry applies from its effective-from day, and the
 * first one also reaches back over the days before it, which waited as pending, unless it was
 * set with an as-of date (#6347).
 */

import { shiftUtcDate } from '../localDay';

/** How far back an agreed rate may be dated (#6347). Mirrored in `functions/`. */
export const MAX_AS_OF_DAYS_BACK = 30;

/** The earliest as-of day: `MAX_AS_OF_DAYS_BACK` before `today`, or the moon owner's first day if later. */
export function earliestAsOf(today: string, joinedDay: string): string {
  const limit = shiftUtcDate(today, -MAX_AS_OF_DAYS_BACK);
  return joinedDay > limit ? joinedDay : limit;
}

export type OwnerRateKind = 'requested' | 'agreed';

export interface OwnerRateEntry {
  kind: OwnerRateKind;
  pct: number;
  /** First EVE/UTC day the rate applies to. */
  effectiveFrom: string;
  /** ISO instant the entry was recorded; breaks a tie between entries of one day. */
  recordedAt: string;
  /**
   * Set on an agreed entry written with an as-of date (#6347): it counts from `effectiveFrom`
   * only and never reaches back. Absent on older entries, which keep reaching back.
   */
  noBackdate?: true;
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

/** The first agreed entry: it reaches back over the days before any rate was agreed. */
function firstAgreed(history: readonly OwnerRateEntry[]): OwnerRateEntry | undefined {
  let first: OwnerRateEntry | undefined;
  for (const entry of history) {
    if (entry.kind !== 'agreed') continue;
    if (
      !first ||
      entry.effectiveFrom < first.effectiveFrom ||
      (entry.effectiveFrom === first.effectiveFrom && entry.recordedAt < first.recordedAt)
    )
      first = entry;
  }
  return first;
}

/** The first agreed entry, unless it was set with an as-of date: then nothing reaches back. */
function reachBackEntry(history: readonly OwnerRateEntry[]): OwnerRateEntry | undefined {
  const first = firstAgreed(history);
  return first?.noBackdate ? undefined : first;
}

/**
 * The agreed rate in effect on `date`; before the first agreed rate starts, that first one
 * (backdated, unless set with an as-of day). A requested rate never takes effect: with nothing agreed there is no rate.
 */
export function effectiveOwnerRate(
  history: readonly OwnerRateEntry[],
  date: string
): EffectiveOwnerRate | undefined {
  const entry = latestOf(history, 'agreed', date) ?? reachBackEntry(history);
  return entry && { pct: entry.pct, kind: entry.kind, effectiveFrom: entry.effectiveFrom };
}

/** The feeder's own requested rate in effect on `date`, whatever was agreed. */
export function requestedOwnerRate(
  history: readonly OwnerRateEntry[],
  date: string
): number | undefined {
  return latestOf(history, 'requested', date)?.pct;
}

/**
 * A request still waiting on the accounting corporation (#6209): the moon owner's latest request
 * when nothing is agreed, or when it was recorded after the last agreement and asks for another
 * rate. Undefined when there is none.
 */
export function pendingRateRequest(history: readonly OwnerRateEntry[]): number | undefined {
  const last = (kind: OwnerRateKind) =>
    history
      .filter((e) => e.kind === kind)
      .reduce<OwnerRateEntry | undefined>(
        (l, e) => (!l || e.recordedAt >= l.recordedAt ? e : l),
        undefined
      );
  const request = last('requested');
  if (!request) return undefined;
  const agreement = last('agreed');
  if (!agreement) return request.pct;
  return request.recordedAt > agreement.recordedAt && request.pct !== agreement.pct
    ? request.pct
    : undefined;
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
  /** When the edit that made the change was recorded: tells apart two changes to one rate on one day. */
  recordedAt?: string;
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
  const recordedAt = after.reduce<string | undefined>(
    (max, e) => (max === undefined || e.recordedAt > max ? e.recordedAt : max),
    undefined
  );
  return {
    date,
    ...(previous ? { oldPct: previous.pct } : {}),
    newPct: next.pct,
    ...(requestedPct !== undefined ? { requestedPct } : {}),
    ...(recordedAt !== undefined ? { recordedAt } : {}),
  };
}

/**
 * The last time the accounting corporation moved the effective rate: replays
 * each agreed entry in the order recorded and keeps the last that changed it.
 * A request alone is never an event, and neither is an agreement to the rate
 * already in force. `requestedPct` is what the moon owner asks for now.
 */
export function latestRateChange(history: readonly OwnerRateEntry[]): OwnerRateChange | undefined {
  const ordered = [...history].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  let last: OwnerRateChange | undefined;
  ordered.forEach((entry, i) => {
    if (entry.kind !== 'agreed') return;
    const event = rateChangeEvent({
      before: ordered.slice(0, i),
      after: ordered.slice(0, i + 1),
      date: entry.effectiveFrom,
    });
    if (event) last = event;
  });
  if (!last) return undefined;
  const asked = requestedOwnerRate(history, '9999-12-31');
  return {
    date: last.date,
    ...(last.oldPct !== undefined ? { oldPct: last.oldPct } : {}),
    newPct: last.newPct,
    ...(asked !== undefined ? { requestedPct: asked } : {}),
    ...(last.recordedAt !== undefined ? { recordedAt: last.recordedAt } : {}),
  };
}

/** What the moon owner's page says about a rate change; `askedPct` only when it differs from the new rate. */
export interface RateNotice {
  pct: number;
  date: string;
  askedPct?: number;
}

export function rateNotice(change: OwnerRateChange): RateNotice {
  const asked = change.requestedPct;
  return {
    pct: change.newPct,
    date: change.date,
    ...(asked !== undefined && asked !== change.newPct ? { askedPct: asked } : {}),
  };
}
