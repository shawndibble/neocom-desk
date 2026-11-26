import { DAY_MS } from '@/lib/age';
import { DEFAULT_GRACE_HOURS, isDayBillable, lastBillableDate } from './billable';
import {
  closePeriod,
  MAX_COVERAGE_BACKDATE_DAYS,
  splitByCoverage,
  type CoveragePeriod,
  type FeederCoverage,
} from './coverage';
import { shiftDate } from '../miningTax/yieldRange';
import { utcDay } from '@/engine/localDay';
import type { ObservedMiningEntry } from './types';

export const FEEDER_DISCONNECT_DAYS = 30;

export interface FeederHealth {
  status: 'active' | 'disconnected';
  lastReadWellAt?: string;
  staleSince?: string;
}

export type FeederReadOutcome = 'ok' | 'stale' | 'none';

export function advanceFeederHealth(
  prev: FeederHealth,
  outcome: FeederReadOutcome,
  now: string
): FeederHealth {
  if (prev.status === 'disconnected') return prev;
  if (outcome === 'ok') return { status: 'active', lastReadWellAt: now };
  const staleSince = outcome === 'stale' ? (prev.staleSince ?? now) : prev.staleSince;
  const next: FeederHealth = {
    ...prev,
    ...(staleSince !== undefined ? { staleSince } : {}),
  };
  if (
    staleSince !== undefined &&
    Date.parse(now) - Date.parse(staleSince) >= FEEDER_DISCONNECT_DAYS * DAY_MS
  ) {
    return { ...next, status: 'disconnected' };
  }
  return next;
}

function lastFullyReadDay(
  lastReadWellAt: string | undefined,
  graceHours: number | undefined
): string | undefined {
  return lastReadWellAt === undefined
    ? undefined
    : lastBillableDate({
        now: lastReadWellAt,
        lastSyncedAt: lastReadWellAt,
        ...(graceHours !== undefined ? { graceHours } : {}),
      });
}

export function disconnectedCoverage(
  periods: readonly CoveragePeriod[],
  health: Pick<FeederHealth, 'lastReadWellAt'>,
  graceHours: number = DEFAULT_GRACE_HOURS
): CoveragePeriod[] {
  const lastFull = lastFullyReadDay(health.lastReadWellAt, graceHours);
  if (lastFull === undefined) {
    const open = periods.find((p) => p.to === undefined);
    return open ? closePeriod(periods, open.from) : [...periods];
  }
  return closePeriod(periods, shiftDate(lastFull, 1));
}

export interface StaleLedgerClock {
  lastReadWellAt?: string;
  staleSince: string;
}

export function staleLedgerClock(
  staleSince: number,
  lastReadWellAt: number | string | null | undefined
): StaleLedgerClock {
  const read =
    lastReadWellAt === null || lastReadWellAt === undefined
      ? undefined
      : typeof lastReadWellAt === 'string'
        ? lastReadWellAt
        : new Date(lastReadWellAt).toISOString();
  return {
    staleSince: new Date(staleSince).toISOString(),
    ...(read !== undefined ? { lastReadWellAt: read } : {}),
  };
}

export function oreLostOn(
  health: StaleLedgerClock,
  graceHours: number = DEFAULT_GRACE_HOURS
): string {
  const lastFull = lastFullyReadDay(health.lastReadWellAt, graceHours);
  const firstUnread =
    lastFull === undefined ? utcDay(Date.parse(health.staleSince)) : shiftDate(lastFull, 1);
  return shiftDate(firstUnread, MAX_COVERAGE_BACKDATE_DAYS + 1);
}

export function daysUntilOreLost(
  health: StaleLedgerClock,
  now: string,
  graceHours: number = DEFAULT_GRACE_HOURS
): number {
  const left = Math.round(
    (Date.parse(oreLostOn(health, graceHours)) - Date.parse(utcDay(Date.parse(now)))) / DAY_MS
  );
  return Math.max(0, left);
}

export interface FeederReadClock {
  corporationId: number;
  lastReadWellAt?: string;
}

export function withholdUnreadFeederDays<
  T extends Pick<ObservedMiningEntry, 'characterId' | 'date' | 'sourceCorporationId'>,
>(
  entries: readonly T[],
  clock: {
    now: string;
    graceHours?: number;
    bookCorporationId: number;
    feeders: readonly FeederReadClock[];
  }
): T[] {
  const byCorp = new Map(clock.feeders.map((f) => [f.corporationId, f]));
  const held = new Set<string>();
  for (const e of entries) {
    const source = e.sourceCorporationId;
    if (source === undefined || source === clock.bookCorporationId) continue;
    const feeder = byCorp.get(source);
    if (!feeder) continue;
    const billable = isDayBillable(e.date, {
      now: clock.now,
      ...(feeder.lastReadWellAt !== undefined ? { lastSyncedAt: feeder.lastReadWellAt } : {}),
      ...(clock.graceHours !== undefined ? { graceHours: clock.graceHours } : {}),
    });
    if (!billable) held.add(`${e.characterId}:${e.date}`);
  }
  return held.size === 0
    ? [...entries]
    : entries.filter((e) => !held.has(`${e.characterId}:${e.date}`));
}

export function splitByCoverageAndRead<
  T extends Pick<ObservedMiningEntry, 'characterId' | 'date' | 'sourceCorporationId'>,
>(
  rows: readonly T[],
  clock: {
    now: string;
    graceHours?: number;
    bookCorporationId: number;
    feeders: readonly (FeederReadClock & FeederCoverage)[];
  }
): { readable: T[]; unread: T[]; outsideCoverage: T[] } {
  const { covered, outsideCoverage } = splitByCoverage(
    rows,
    clock.bookCorporationId,
    clock.feeders
  );
  const readable = withholdUnreadFeederDays(covered, clock);
  const kept = new Set(readable);
  return { readable, unread: covered.filter((r) => !kept.has(r)), outsideCoverage };
}

export function heldBillableThrough(
  billableThrough: string | undefined,
  characterIds: readonly number[],
  holds: ReadonlyMap<number, Pick<StaleHold, 'from'>>
): string | undefined {
  if (billableThrough === undefined) return undefined;
  let through = billableThrough;
  for (const id of characterIds) {
    const held = holds.get(id)?.from;
    if (held === undefined) continue;
    const before = shiftDate(held, -1);
    if (before < through) through = before;
  }
  return through;
}

type StaleHoldClock = {
  now: string;
  graceHours?: number;
  bookCorporationId: number;
  feeders: readonly (FeederReadClock & FeederCoverage)[];
};

export interface StaleHold {
  from: string;
  ownerCorporationId: number;
}

export function staleOwnerHolds(
  entries: readonly Pick<ObservedMiningEntry, 'characterId' | 'sourceCorporationId'>[],
  clock: StaleHoldClock,
  billableThrough: string | undefined
): Map<number, StaleHold> {
  const out = new Map<number, StaleHold>();
  if (billableThrough === undefined) return out;
  const heldFrom = new Map<number, string>();
  for (const f of clock.feeders) {
    if (f.corporationId === clock.bookCorporationId) continue;
    const lastRead = lastFullyReadDay(f.lastReadWellAt, clock.graceHours);
    const unread = lastRead === undefined ? '' : shiftDate(lastRead, 1);
    const first =
      f.coveragePeriods === undefined
        ? unread || undefined
        : f.coveragePeriods
            .filter((p) => p.to === undefined || p.to >= unread)
            .map((p) => (p.from > unread ? p.from : unread))
            .sort()[0];
    if (first === undefined || first === '' || first > billableThrough) continue;
    heldFrom.set(f.corporationId, first);
  }
  if (heldFrom.size === 0) return out;
  for (const e of entries) {
    const day =
      e.sourceCorporationId === undefined ? undefined : heldFrom.get(e.sourceCorporationId);
    if (day === undefined) continue;
    const held = out.get(e.characterId);
    if (held === undefined || day < held.from)
      out.set(e.characterId, { from: day, ownerCorporationId: e.sourceCorporationId! });
  }
  return out;
}
