import type { RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import type { TradeHub } from '@/market/hubs';
import type { PayeeRecord } from '@/db';
import type { PayeePaymentLink } from '@/engine/miningTax/payeeRunningAccount';
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
  paymentLinks: PayeePaymentLink[];
  billedElsewhere: ReadonlyMap<string, number>;
  unclassified: { characterId: number; characterName: string; typeIds: number[] }[];
  reauthCharacters: TrackedCharacter[];
  fetchedAt: Date | null;
  fromCache: boolean;
  systemNames: Map<number, string>;
  systemSecurity: Map<number, number>;
  typeNames: Map<number, string>;
  datedPrices: DatedUnitPrices;
  unpricedByHub: ReadonlyMap<TradeHub['id'], ReadonlySet<number>>;
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
