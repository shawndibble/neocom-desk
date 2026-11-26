import { lastBillableDate } from '../billable';
import { buildDayCharges } from '../charges';
import { splitByCoverageAndRead, staleOwnerHolds } from '../feederHealth';
import { minerIdsOf, settleMiner } from './miners';
import { placeOfFor } from './place';
import type { MinerSettlement, OpenSet, OpenSetInput } from './types';

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
