import { lastBillableDate } from '../billable';
import { buildDayCharges } from '../charges';
import { splitByCoverageAndRead, staleOwnerHolds } from '../feederHealth';
import { minerIdsOf, settleMiner } from './miners';
import { placeOfFor } from './place';
import type { MinerSettlement, OpenSet, OpenSetInput } from './types';

/**
 * A book's open set (ADR 0032): its unbilled and unpaid side, settled from the rows and
 * records the reader holds. Coverage first, so a moon owner's day outside it owes nothing and
 * never holds a miner's day (#4618); a covered day its ledger was not read well after is not
 * Billable yet (#4622). Then each day's charge, the last Billable day, and each Miner's
 * Running account. The officer's view and the member's
 * overlay all read this one settlement, so they cannot drift apart.
 */
export function settleOpenSet(input: OpenSetInput): OpenSet {
  const placeOf = placeOfFor(input.placement, input.entries);
  const clock = {
    now: input.now,
    ...(input.graceHours !== undefined ? { graceHours: input.graceHours } : {}),
    bookCorporationId: input.corporationId,
    feeders: input.feeders ?? [],
  };
  const { readable, unread, outsideCoverage } = splitByCoverageAndRead(input.entries, clock);
  const { charges, beforeBook, unrated } = buildDayCharges(readable, {
    corporationId: input.corporationId,
    startDate: input.startDate,
    miners: input.miners,
    rates: input.rates,
    pricesOn: input.pricesOn,
    placeOf,
  });
  const billableThrough = lastBillableDate({
    now: input.now,
    ...(input.lastSyncedAt !== undefined ? { lastSyncedAt: input.lastSyncedAt } : {}),
    ...(input.graceHours !== undefined ? { graceHours: input.graceHours } : {}),
  });
  // A miner at a moon owner that cannot be read is held from its first unread day (#6209).
  const holds = staleOwnerHolds(input.entries, clock, billableThrough);

  const minerIds = minerIdsOf(input, charges);
  const miners = new Map<string, MinerSettlement>();
  for (const id of minerIds)
    miners.set(id, settleMiner(input, id, charges, { billableThrough, holds }));

  return {
    placeOf,
    charges,
    beforeBook,
    unrated,
    outsideCoverage,
    unread,
    billableThrough,
    minerIds,
    miners,
  };
}
