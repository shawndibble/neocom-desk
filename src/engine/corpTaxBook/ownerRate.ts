import { shiftUtcDate } from '../localDay';

export const MAX_AS_OF_DAYS_BACK = 30;

export function earliestAsOf(today: string, joinedDay: string): string {
  const limit = shiftUtcDate(today, -MAX_AS_OF_DAYS_BACK);
  return joinedDay > limit ? joinedDay : limit;
}

export type OwnerRateKind = 'requested' | 'agreed';

export interface OwnerRateEntry {
  kind: OwnerRateKind;
  pct: number;
  effectiveFrom: string;
  recordedAt: string;
  noBackdate?: true;
}

export interface EffectiveOwnerRate {
  pct: number;
  kind: OwnerRateKind;
  effectiveFrom: string;
}

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

function reachBackEntry(history: readonly OwnerRateEntry[]): OwnerRateEntry | undefined {
  const first = firstAgreed(history);
  return first?.noBackdate ? undefined : first;
}

export function effectiveOwnerRate(
  history: readonly OwnerRateEntry[],
  date: string
): EffectiveOwnerRate | undefined {
  const entry = latestOf(history, 'agreed', date) ?? reachBackEntry(history);
  return entry && { pct: entry.pct, kind: entry.kind, effectiveFrom: entry.effectiveFrom };
}

export function requestedOwnerRate(
  history: readonly OwnerRateEntry[],
  date: string
): number | undefined {
  return latestOf(history, 'requested', date)?.pct;
}

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

export function ownerMargin(
  minerPct: number | undefined,
  ownerPct: number | undefined
): number | undefined {
  if (minerPct === undefined || ownerPct === undefined) return undefined;
  return Math.round((minerPct - ownerPct) * 1e6) / 1e6;
}

export interface OwnerRateChange {
  date: string;
  oldPct?: number;
  newPct: number;
  requestedPct?: number;
  recordedAt?: string;
}

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
