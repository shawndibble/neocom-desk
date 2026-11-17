/**
 * What a refinery's page reads from its Extractions' moon docs (issue #6348, ADR 0032): the
 * ore mined in each Extraction's window and each Miner's share of it, valued at the unit prices
 * given. Pure: no fetch, DOM or Dexie. Mining outside an Extraction's window is not in a moon
 * doc, so it is not counted here.
 */
import type { MoonDoc, OreQty } from '../../../functions/src/corpTaxBookMoonDocs';
import type { RefineryMining } from './moonOwnerRefineries';

/** The unit price of an ore, 0 when it has none. */
export type PriceOf = (typeId: number) => number;

/** The value of mined ore lines at the given prices. */
export const oreValue = (lines: readonly OreQty[], priceOf: PriceOf): number =>
  lines.reduce((sum, l) => sum + l.quantity * priceOf(l.typeId), 0);

export interface RefineryMiner {
  /** A grouping id, or `solo:<characterId>`. */
  minerId: string;
  /** Extractions this Miner mined in. */
  pulls: number;
  /** The pop of the newest Extraction they mined in (ISO). */
  lastPopAt: string;
  isk: number;
}

/** Every Miner in the docs, biggest first (ties by id). Never capped. */
export function refineryMiners(docs: readonly MoonDoc[], priceOf: PriceOf): RefineryMiner[] {
  const byMiner = new Map<string, RefineryMiner>();
  for (const doc of docs) {
    for (const m of doc.miners) {
      const held = byMiner.get(m.minerId);
      const isk = oreValue(m.oreLines, priceOf);
      if (held) {
        held.pulls += 1;
        held.isk += isk;
        if (doc.chunkArrivalAt > held.lastPopAt) held.lastPopAt = doc.chunkArrivalAt;
      } else {
        byMiner.set(m.minerId, {
          minerId: m.minerId,
          pulls: 1,
          lastPopAt: doc.chunkArrivalAt,
          isk,
        });
      }
    }
  }
  return [...byMiner.values()].sort((a, b) => b.isk - a.isk || a.minerId.localeCompare(b.minerId));
}

/** How many Extractions had anyone mining: the "of N" under each Miner's count. */
export const minedPullCount = (docs: readonly MoonDoc[]): number =>
  docs.filter((d) => d.miners.length > 0).length;

/**
 * The docs as mining lines for the archive rules (`refineryRows`): one per Miner per
 * Extraction, dated the day its window ends, never later than today. Only the date and the
 * value matter there.
 */
export function docMining(
  docs: readonly MoonDoc[],
  priceOf: PriceOf,
  today: string
): RefineryMining[] {
  return docs.flatMap((doc) => {
    const end = (doc.expiresAt ?? doc.fracturedAt ?? doc.chunkArrivalAt).slice(0, 10);
    const date = end > today ? today : end;
    return doc.miners.map((m) => ({
      structureId: doc.structureId,
      characterId: 0,
      date,
      quantity: m.oreLines.reduce((sum, l) => sum + l.quantity, 0),
      value: oreValue(m.oreLines, priceOf),
    }));
  });
}
