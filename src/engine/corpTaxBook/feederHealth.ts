/**
 * A feeder's ledger health (Collector books, #4509). A read of its ledger either
 * lands (`ok`) or is refused (`stale`: a 403, a revoked token, a lost role). While
 * stale, days at its refineries are not Billable; after FEEDER_DISCONNECT_DAYS
 * (the ESI ledger history window) the feeder is disconnected and coverage ends.
 * Pure; mirrored by functions/src/corpTaxBookEngine.ts.
 */
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
  /** ISO instant of the last ledger read that landed. */
  lastReadWellAt?: string;
  /** ISO instant the first refused read of the current stale spell happened. */
  staleSince?: string;
}

/**
 * `ok`: the ledger was read. `stale`: ESI refused it. `none`: not tried or
 * inconclusive (ESI down, budget low); the stale clock still runs.
 */
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

/** The last day a good read at `lastReadWellAt` fully read (past its grace); never read well: none. */
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

/**
 * Coverage once a feeder disconnects: it ends on the last fully synced day (a
 * closed day a good read followed). Never read well: it covered nothing.
 */
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

/** A stale ledger's clock: its last good read and when it was first refused (ISO instants). */
export interface StaleLedgerClock {
  lastReadWellAt?: string;
  staleSince: string;
}

/** A stale ledger's clock from what a row or view summary holds: ms, or an ISO instant. */
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

/**
 * The UTC day EVE no longer holds the first unread day of a stale ledger, so ore a reconnect
 * could still count (`reconnectCoverageFrom` reaches 30 days back) starts being lost. The first
 * unread day follows the last fully read one; never read well, it is the day it went stale.
 */
export function oreLostOn(
  health: StaleLedgerClock,
  graceHours: number = DEFAULT_GRACE_HOURS
): string {
  const lastFull = lastFullyReadDay(health.lastReadWellAt, graceHours);
  const firstUnread =
    lastFull === undefined ? utcDay(Date.parse(health.staleSince)) : shiftDate(lastFull, 1);
  return shiftDate(firstUnread, MAX_COVERAGE_BACKDATE_DAYS + 1);
}

/** Whole days left before `oreLostOn`; 0: already lost. */
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

/**
 * Drop each feeder-recorded day that is not yet Billable (no good read of that
 * feeder after the day's grace), along with every other row of the same miner
 * that day: no miner is billed off a partial day. One stale feeder never holds
 * another feeder's days, nor days of miners it did not touch.
 */
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

/**
 * A book's observed rows against its moon owners: rows outside a moon owner's coverage owe
 * nothing (#4618); of the covered, a day its ledger was not read well after is held, with the
 * miner's whole day (#4622). Coverage first, so a day outside it never holds a miner's day.
 */
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

/**
 * The last day a miner's account may bill while one of its days is held (#6209): the day before
 * its earliest held day, else the book's `billableThrough`. The account must not bill a held day:
 * once paid, ore that lands on that day later would be written off as recorded after payment
 * instead of being billed.
 */
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

/** A miner's hold: from which day, and the moon owner whose unread ledger holds it (#6210). */
export interface StaleHold {
  from: string;
  ownerCorporationId: number;
}

/**
 * The day each miner is held from while a moon owner it mines at cannot be read (#6209): a stale
 * moon owner's first unread day (its first covered day when never read well), for every character
 * with a row at its refineries. Its ore for those days may not be read yet, so the account must not
 * bill them. An owner read up to `billableThrough`, or whose coverage ended before its first
 * unread day, holds nothing. Each hold names its moon owner, so a held day can say why (#6210).
 */
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
    // The first covered day on or after it; no coverage known: the first unread day itself.
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
