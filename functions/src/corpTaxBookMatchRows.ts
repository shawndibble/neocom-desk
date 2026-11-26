import { minerIdFor, type MatchMiner } from './corpTaxBookDonationMatch.js';
import { isDayCovered, type CoveragePeriod } from './corpTaxBookEngine.js';
import { utcDayOf } from './timeConstants.js';

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
    const characters = miner
      ? [...miner.characterIds, ...Object.keys(miner.leftOn ?? {}).map(Number)]
      : [characterId];
    for (const c of characters) out.set(c, input.startDate);
  };
  for (const p of input.held) if (utcDayOf(p.at) >= input.startDate) want(p.characterId);
  for (const characterId of input.senders) want(characterId);
  return out;
}

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
