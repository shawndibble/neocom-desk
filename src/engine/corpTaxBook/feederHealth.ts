/**
 * A feeder's ledger health (Collector books, #4509). A read of its ledger either
 * lands (`ok`) or is refused (`stale`: a 403, a revoked token, a lost role). While
 * stale, days at its refineries are not Billable; after FEEDER_DISCONNECT_DAYS
 * (the ESI ledger history window) the feeder is disconnected and coverage ends.
 * Pure; mirrored by functions/src/corpTaxBookEngine.ts.
 */
import { DAY_MS } from '@/lib/age';
import { DEFAULT_GRACE_HOURS, isDayBillable, lastBillableDate } from './billable';
import { closePeriod, type CoveragePeriod } from './coverage';
import { shiftDate } from '../miningTax/yieldRange';
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

/**
 * Coverage once a feeder disconnects: it ends on the last fully synced day (a
 * closed day a good read followed). Never read well: it covered nothing.
 */
export function disconnectedCoverage(
  periods: readonly CoveragePeriod[],
  health: Pick<FeederHealth, 'lastReadWellAt'>,
  graceHours: number = DEFAULT_GRACE_HOURS
): CoveragePeriod[] {
  const lastFull =
    health.lastReadWellAt === undefined
      ? undefined
      : lastBillableDate({
          now: health.lastReadWellAt,
          lastSyncedAt: health.lastReadWellAt,
          graceHours,
        });
  if (lastFull === undefined) {
    const open = periods.find((p) => p.to === undefined);
    return open ? closePeriod(periods, open.from) : [...periods];
  }
  return closePeriod(periods, shiftDate(lastFull, 1));
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
