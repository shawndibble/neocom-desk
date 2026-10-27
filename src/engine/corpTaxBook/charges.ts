/**
 * Day charges (D4): tax is owed per day per character, from each Observed
 * Mining Entry at its date's prices and the rate in effect that day, and
 * rolls up to a Miner — one or more characters billed together (D18), one per
 * character by default.
 */
import { observedEntryKey } from './observed';
import { resolveRate, type RateScope, type TaxRate } from './rates';
import { valueObservedEntry } from './valuation';
import type { TaxPriceSource } from '../miningTax/priceBasis';
import type { DayPrices } from './valuation';
import type { ObservedMiningEntry, OreLine } from './types';

export interface Miner {
  id: string;
  characterIds: number[];
  /** The character that gets the mail. */
  mainCharacterId: number;
  /** An officer closed this guest's account (#4184): no Statement mail after the final one. */
  closedAt?: string;
  /** The final Statement the close issued, if anything was left to bill. */
  finalStatementId?: string;
}

/** The Miner a character is billed under: its grouping, or a Miner of its own. */
export function minerIdFor(characterId: number, miners: readonly Miner[]): string {
  return miners.find((m) => m.characterIds.includes(characterId))?.id ?? `solo:${characterId}`;
}

/** What one Observed Mining Entry owes, snapshotted with the inputs that priced it. */
export interface DayCharge {
  /** `observedEntryKey`: character + refinery + day. */
  key: string;
  minerId: string;
  characterId: number;
  structureId: number;
  moonId?: number;
  extractionId?: string;
  date: string;
  isGuest: boolean;
  oreLines: OreLine[];
  /** Per-unit price by raw type id on `date` at the book's hub and Ore Form. */
  /** Records rather than Maps so a charge stores as plain data. */
  unitPrices: Record<number, number>;
  /** Which price tier priced each raw type id. */
  priceSources: Record<number, TaxPriceSource>;
  taxPct: number;
  rateScope: RateScope;
  rateEffectiveFrom?: string;
  estimatedValue: number;
  taxOwed: number;
}

export interface ChargeBook {
  corporationId: number;
  /** The book's start date (D10): earlier mining is history that owes nothing. */
  startDate: string;
  miners: readonly Miner[];
  rates: readonly TaxRate[];
  /** The day's prices at the book's hub and Ore Form (`priceObservedDay`). */
  pricesOn: (date: string) => Pick<DayPrices, 'prices' | 'sources'>;
  /** The moon and Extraction a refinery was working on a date, when known. */
  placeOf: (structureId: number, date: string) => { moonId?: number; extractionId?: string };
}

export interface DayCharges {
  charges: DayCharge[];
  /** Mining before the book's start date — "Before the book". */
  beforeBook: ObservedMiningEntry[];
  /** Entries no rate covered yet — the caller asks for a corp default. */
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
    const minerId = minerIdFor(entry.characterId, book.miners);
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
