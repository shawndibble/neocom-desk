// Which ore a donation is matched against (decision 20261120-235011): the one copy of the rules
// the client's sync and the scheduled sync both run, dependency-free so the client imports it.
// A sync's own ESI read holds only the book's refineries, but the book also bills ore mined at its
// moon owners' refineries, which only their stored rows hold. Every book is a Running account, so
// what a Miner mined since the book's start is what they may owe: there is no billed-through day.

import { minerIdFor, type MatchMiner } from './corpTaxBookDonationMatch.js';
import { isDayCovered, type CoveragePeriod } from './corpTaxBookEngine.js';
import { utcDayOf } from './timeConstants.js';

/** The Miners who mined, on or after the book's start, in these rows. */
export function minedSinceStart(
  rows: readonly { characterId: number; date: string; quantity: number }[],
  miners: readonly MatchMiner[],
  startDate: string
): Set<string> {
  const out = new Set<string>();
  for (const r of rows)
    if (r.quantity > 0 && r.date >= startDate) out.add(minerIdFor(r.characterId, miners, r.date));
  return out;
}

/**
 * By Character, the first day of stored rows to match donations against: every Character of each
 * held (`no-open-balance`) donation's Miner, if it was paid on or after the book's start, and of
 * each new donation's sender's Miner, from the book's start.
 */
export function storedRowsWanted(input: {
  held: readonly { characterId: number; at: string }[];
  senders: readonly number[];
  miners: readonly MatchMiner[];
  startDate: string;
}): Map<number, string> {
  const out = new Map<number, string>();
  const want = (characterId: number) => {
    const minerId = minerIdFor(characterId, input.miners);
    const miner = input.miners.find((m) => m.id === minerId);
    // Characters that left it still billed it before they left: their rows are wanted too.
    const characters = miner
      ? [...miner.characterIds, ...Object.keys(miner.leftOn ?? {}).map(Number)]
      : [characterId];
    for (const c of characters) out.set(c, input.startDate);
  };
  for (const p of input.held) if (utcDayOf(p.at) >= input.startDate) want(p.characterId);
  for (const characterId of input.senders) want(characterId);
  return out;
}

/**
 * The stored rows `storedRowsWanted` asked for that the book bills: a wanted Character's, from its
 * day on, and a moon owner's only on a day its coverage holds (outside it, mining owes nothing).
 * The book's own refineries' rows, and a moon owner it does not know, are not tested.
 */
export function billableStoredRows<
  T extends { characterId: number; date: string; sourceCorporationId?: number },
>(
  rows: readonly T[],
  wanted: ReadonlyMap<number, string>,
  bookCorporationId: number,
  feeders: readonly { corporationId: number; coveragePeriods?: readonly CoveragePeriod[] }[]
): T[] {
  const periodsOf = new Map(feeders.map((f) => [f.corporationId, f.coveragePeriods]));
  return rows.filter((r) => {
    const from = wanted.get(r.characterId);
    if (from === undefined || r.date < from) return false;
    const source = r.sourceCorporationId;
    const periods =
      source === undefined || source === bookCorporationId ? undefined : periodsOf.get(source);
    return periods === undefined || isDayCovered(periods, r.date);
  });
}
