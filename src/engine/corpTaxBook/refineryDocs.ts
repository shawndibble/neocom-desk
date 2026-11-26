import type { MoonDoc, OreQty } from '../../../functions/src/corpTaxBookMoonDocs';

export type PriceOf = (typeId: number) => number;

export const oreValue = (lines: readonly OreQty[], priceOf: PriceOf): number =>
  lines.reduce((sum, l) => sum + l.quantity * priceOf(l.typeId), 0);

export interface RefineryMiner {
  minerId: string;
  pulls: number;
  lastPopAt: string;
  isk: number;
}

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

export const minedPullCount = (docs: readonly MoonDoc[]): number =>
  docs.filter((d) => d.miners.length > 0).length;
