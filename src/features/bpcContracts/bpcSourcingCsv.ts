import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import {
  asContract,
  effectivePrice,
  iskPerRun,
  type BpcSearchRow,
} from '@/engine/contracts/bpcSearch';
import { BPC_SEARCH_COLUMN_IDS, type BpcSearchColumnId } from './bpcSearchColumns';

export interface BpcSourcingCsvContext {
  nameFor: (typeId: number) => string;
  regionName: (regionId: number) => string;
  /** The row's settled jump count; null while pending, unmeasurable, or unplaced. */
  jumpsFor: (row: BpcSearchRow) => number | null;
}

/**
 * The ISK a row asks for, raw. A contract's is `effectivePrice` (an auction's
 * buyout) — except a PLEX barter's, whose ask isn't ISK at all, so it is blank
 * rather than a misleading 0 (a PLEX ask *plus* a real ISK price keeps the ISK
 * figure). An owned row has no price.
 */
function priceOf(row: BpcSearchRow): number | null {
  if (row.source === 'market' || row.source === 'lp') return row.price;
  const contract = asContract(row);
  if (!contract) return null;
  if (contract.requestedPlex && !(contract.price > 0)) return null;
  return effectivePrice(contract);
}

function regionIdOf(row: BpcSearchRow): number | null {
  return row.source === 'contract' ? row.contract.regionId : row.regionId;
}

/**
 * Export columns for BPC Sourcing's table: Item, then whichever optional
 * columns the pilot has visible, in the table's order. Every figure raw; a
 * BPO's -1 runs, and every cell the table fills with "n/a", is blank.
 */
export function bpcSourcingCsvColumns(
  t: CsvTranslate,
  context: BpcSourcingCsvContext,
  visibleColumns: readonly BpcSearchColumnId[]
): CsvColumn<BpcSearchRow>[] {
  const byId: Record<BpcSearchColumnId, CsvColumn<BpcSearchRow>> = {
    source: {
      header: t('bpcContracts.sourceColumn'),
      value: (row) =>
        row.source === 'contract'
          ? t('bpcContracts.sourceContractSingular')
          : row.source === 'market'
            ? t('bpcContracts.sourceMarketSingular')
            : row.source === 'lp'
              ? t('bpcContracts.sourceLpStoreSingular')
              : t('bpcContracts.sourceOwned'),
    },
    location: {
      header: t('bpcContracts.locationColumn'),
      value: (row) => (row.source === 'lp' ? row.corpName : row.locationName),
    },
    jumps: { header: t('bpcContracts.jumpsColumn'), value: (row) => context.jumpsFor(row) },
    me: { header: t('bpcContracts.meColumn'), value: (row) => row.me },
    te: { header: t('bpcContracts.teColumn'), value: (row) => row.te },
    runs: {
      header: t('bpcContracts.runsColumn'),
      value: (row) => (row.runs === -1 ? null : row.runs),
    },
    qty: { header: t('bpcContracts.qtyColumn'), value: (row) => row.quantity },
    iskPerRun: {
      header: t('bpcContracts.iskPerRunColumn'),
      value: (row) => {
        const contract = asContract(row);
        if (!contract) return null;
        return iskPerRun(
          effectivePrice(contract),
          contract.runs,
          contract.quantity,
          contract.isMultiType
        );
      },
    },
    price: { header: t('bpcContracts.priceColumn'), value: priceOf },
    region: {
      header: t('bpcContracts.regionColumn'),
      value: (row) => {
        const regionId = regionIdOf(row);
        return regionId == null ? null : context.regionName(regionId);
      },
    },
    space: {
      header: t('bpcContracts.spaceColumn'),
      value: (row) => (row.space ? t(`common.spaceOption.${row.space}`) : null),
    },
    expires: {
      header: t('bpcContracts.expiresColumn'),
      value: (row) => {
        const contract = asContract(row);
        return contract ? new Date(contract.dateExpired).toISOString() : null;
      },
    },
  };
  return [
    { header: t('bpcContracts.itemColumn'), value: (row) => context.nameFor(row.typeId) },
    ...BPC_SEARCH_COLUMN_IDS.filter((id) => visibleColumns.includes(id)).map((id) => byId[id]),
  ];
}
