import { minerIdFor, soloCharacterId } from '../../../functions/src/corpTaxBookDonationMatch';
import { observedEntryKey } from './observed';
import { resolveRate, type RateScope, type TaxRate } from './rates';
import { valueObservedEntry } from './valuation';
import type { TaxPriceSource } from '../miningTax/priceBasis';
import type { DayPrices } from './valuation';
import type { ObservedMiningEntry, OreLine } from './types';

export interface Miner {
  id: string;
  characterIds: number[];
  mainCharacterId: number;
  closedAt?: string;
  finalStatementId?: string;
  createdAt?: string;
  paidThrough?: string;
  aliases?: string[];
  leftOn?: Record<number, string>;
}

export function characterIdsOfMiner(minerId: string, miners: readonly Miner[]): number[] {
  const grouped = miners.find((m) => m.id === minerId);
  if (grouped) return [...grouped.characterIds, ...Object.keys(grouped.leftOn ?? {}).map(Number)];
  const solo = soloCharacterId(minerId);
  return solo === undefined ? [] : [solo];
}

export { minerIdFor };

export function bookMinersOf(grouped: readonly Miner[], ids: readonly string[]): Miner[] {
  const out = [...grouped];
  const seen = new Set(grouped.map((m) => m.id));
  const held = new Set(grouped.flatMap((m) => m.characterIds));
  for (const id of ids) {
    const characterId = soloCharacterId(id);
    if (characterId === undefined || seen.has(id)) continue;
    if (held.has(characterId)) continue;
    seen.add(id);
    out.push({ id, characterIds: [characterId], mainCharacterId: characterId });
  }
  return out;
}

export interface DayCharge {
  key: string;
  minerId: string;
  characterId: number;
  structureId: number;
  moonId?: number;
  extractionId?: string;
  date: string;
  isGuest: boolean;
  oreLines: OreLine[];
  unitPrices: Record<number, number>;
  priceSources: Record<number, TaxPriceSource>;
  taxPct: number;
  rateScope: RateScope;
  rateEffectiveFrom?: string;
  estimatedValue: number;
  taxOwed: number;
}

export type PlaceOf = (
  structureId: number,
  date: string
) => { moonId?: number; extractionId?: string };

export interface ChargeBook {
  corporationId: number;
  startDate: string;
  miners: readonly Miner[];
  rates: readonly TaxRate[];
  pricesOn: (date: string) => Pick<DayPrices, 'prices' | 'sources'>;
  placeOf: PlaceOf;
}

export interface DayCharges {
  charges: DayCharge[];
  beforeBook: ObservedMiningEntry[];
  unrated: ObservedMiningEntry[];
}

export function buildDayCharges(
  entries: readonly ObservedMiningEntry[],
  book: ChargeBook
): DayCharges {
  const result: DayCharges = { charges: [], beforeBook: [], unrated: [] };
  for (const entry of entries) {
    if (entry.date < book.startDate) {
      result.beforeBook.push(entry);
      continue;
    }
    const key = observedEntryKey(entry);
    const minerId = minerIdFor(entry.characterId, book.miners, entry.date);
    const place = book.placeOf(entry.structureId, entry.date);
    const isGuest = entry.recordedCorporationId !== book.corporationId;
    const rate = resolveRate(book.rates, {
      date: entry.date,
      minerId,
      moonId: place.moonId,
      structureId: entry.structureId,
      ...(entry.sourceCorporationId !== undefined ? { feederId: entry.sourceCorporationId } : {}),
      recordKey: key,
      isGuest,
      minerCorporationId: entry.recordedCorporationId,
    });
    if (!rate) {
      result.unrated.push(entry);
      continue;
    }
    const { prices, sources } = book.pricesOn(entry.date);
    const { estimatedValue, taxOwed } = valueObservedEntry(entry, prices, rate.pct);
    result.charges.push({
      key,
      minerId,
      characterId: entry.characterId,
      structureId: entry.structureId,
      ...(place.moonId !== undefined ? { moonId: place.moonId } : {}),
      ...(place.extractionId !== undefined ? { extractionId: place.extractionId } : {}),
      date: entry.date,
      isGuest,
      oreLines: entry.oreLines,
      unitPrices: Object.fromEntries(
        entry.oreLines.map((line) => [line.typeId, prices.get(line.typeId) ?? 0])
      ),
      priceSources: Object.fromEntries(
        entry.oreLines.map((line) => [line.typeId, sources.get(line.typeId) ?? 'none'])
      ),
      taxPct: rate.pct,
      rateScope: rate.scope,
      ...(rate.effectiveFrom !== undefined ? { rateEffectiveFrom: rate.effectiveFrom } : {}),
      estimatedValue,
      taxOwed,
    });
  }
  return result;
}
