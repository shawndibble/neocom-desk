import type { RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import type { TradeHub } from '@/market/hubs';
import type { PayeeRecord } from '@/db';
import {
  loadMoonMiningTaxSnapshot,
  type MoonMiningTaxRow,
  type TrackedCharacter,
} from '@/features/miningTax/snapshot';
import { resolveRowNames } from '@/features/miningTax/names';
import { loadDatedUnitPricesByHub, type DatedUnitPrices } from '@/features/miningTax/pricing';
import { loadOreFormNames, readCompressedOre } from './oreForm';

export interface TaxSnapshot {
  entries: MoonMiningTaxRow[];
  characters: TrackedCharacter[];
  payeesByCharacter: Map<number, PayeeRecord[]>;
  unclassified: { characterId: number; characterName: string; typeIds: number[] }[];
  reauthCharacters: TrackedCharacter[];
  fetchedAt: Date | null;
  fromCache: boolean;
  systemNames: Map<number, string>;
  systemSecurity: Map<number, number>;
  typeNames: Map<number, string>;
  /** Per-hub, per-date buy prices — the day the ore was mined, not "now" (issue #523 follow-up). Resolved per Payee/date by `pricesFor`. */
  datedPrices: DatedUnitPrices;
  /** Per hub, the ore types that hub quoted no buy price for on any date they appeared — their price entry is 0, which is not the same claim as "worthless". */
  unpricedByHub: ReadonlyMap<TradeHub['id'], ReadonlySet<number>>;
  /** Union of `unpricedByHub` — whether the banner has anything at all to say. */
  unpricedTypeIds: Set<number>;
}

export const EMPTY_DATED_PRICES: DatedUnitPrices = {
  byHubAndDate: new Map(),
  unpricedByHub: new Map(),
  sellFallbackByHubAndDate: new Map(),
  unpriced: new Set(),
};

export async function loadTaxSnapshot(
  _characterId: number,
  signal: RouteSnapshotSignal
): Promise<TaxSnapshot> {
  const result = await loadMoonMiningTaxSnapshot();
  if (signal.cancelled) {
    return {
      ...result,
      entries: result.rows,
      systemNames: new Map(),
      systemSecurity: new Map(),
      typeNames: new Map(),
      datedPrices: EMPTY_DATED_PRICES,
      unpricedByHub: new Map(),
      unpricedTypeIds: new Set(),
    };
  }
  const unclassifiedTypeIds = result.unclassified.flatMap((u) => u.typeIds);
  // Every hub any Payee bills at, so a dialog can re-price live as the pilot
  // changes which Payee an entry is assigned to. One fetch per *distinct*
  // hub — an all-Jita ledger, the common case, still makes exactly one.
  const payeeHubIds = [...result.payeesByCharacter.values()].flatMap((payees) =>
    payees.map((payee) => payee.hubId)
  );
  const dates = [...new Set(result.rows.map((row) => row.entry.date))];
  const compressed = await readCompressedOre();
  const [
    { systemNames, systemSecurity, typeNames: rowTypeNames },
    datedPrices,
    unclassifiedTypeNames,
  ] = await Promise.all([
    resolveRowNames(result.rows, compressed),
    loadDatedUnitPricesByHub(
      result.rows.flatMap((row) => row.entry.oreLines.map((line) => line.typeId)),
      payeeHubIds,
      dates,
      compressed
    ),
    loadOreFormNames(unclassifiedTypeIds, compressed),
  ]);
  const typeNames = new Map([...rowTypeNames, ...unclassifiedTypeNames]);
  return {
    ...result,
    entries: result.rows,
    systemNames,
    systemSecurity,
    typeNames,
    datedPrices,
    unpricedByHub: datedPrices.unpricedByHub,
    unpricedTypeIds: datedPrices.unpriced,
  };
}
