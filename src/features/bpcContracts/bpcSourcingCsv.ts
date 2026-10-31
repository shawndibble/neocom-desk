import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import {
  asContract,
  effectivePrice,
  iskPerRun,
  type BpcSearchRow,
} from '@/engine/contracts/bpcSearch';
import { exportFlag } from '@/lib/exportFlag';
import { BPC_SEARCH_COLUMN_IDS, type BpcSearchColumnId } from './bpcSearchColumns';

/** What the "BPO too" badge says about a row's blueprint original. */
export interface BpcBpoBadge {
  price: number;
  locationName: string | null;
  regionName: string;
  mayBeCheaper: boolean;
}

export interface BpcSourcingCsvContext {
  nameFor: (typeId: number) => string;
  regionName: (regionId: number) => string;
  /** The row's settled jump count; null while pending, unmeasurable, or unplaced. */
  jumpsFor: (row: BpcSearchRow) => number | null;
  /** The row's solar system security, or null when it has no resolved system. */
  securityFor: (row: BpcSearchRow) => number | null;
  /** The BPO the table's "BPO too" badge sits on for this row (one copy row per type, none with a blueprint picked), or null. */
  bpoBadgeFor: (row: BpcSearchRow) => BpcBpoBadge | null;
}

/**
 * The ISK a row asks for, raw. A contract's is `effectivePrice` (an auction's
 * buyout) — except a PLEX barter's, whose ask isn't ISK at all, so it is blank
 * rather than a misleading 0 (a PLEX ask *plus* a real ISK price keeps the ISK
 * figure). An owned row has no price.
 */
function priceOf(row: BpcSearchRow): number | null {
  if (row.source === 'market' || row.source === 'lp' || row.source === 'community') {
    return row.price;
  }
  const contract = asContract(row);
  if (!contract) return null;
  if (contract.requestedPlex && !(contract.price > 0)) return null;
  return effectivePrice(contract);
}

function regionIdOf(row: BpcSearchRow): number | null {
  return row.source === 'contract' ? row.contract.regionId : row.regionId;
}

/**
 * Export columns for BPC Sourcing's table: Item, then every column the table
 * can show (whether or not the pilot has it visible), then the facts the table
 * keeps in badges and sub-lines. Every figure raw; a BPO's -1 runs, and every
 * cell the table fills with "n/a", is blank.
 */
export function bpcSourcingCsvColumns(
  t: CsvTranslate,
  context: BpcSourcingCsvContext
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
              : row.source === 'community'
                ? t('bpcContracts.sourceCommunitySingular')
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
    ...BPC_SEARCH_COLUMN_IDS.map((id) => byId[id]),
    {
      header: t('bpcContracts.auctionKindColumn'),
      value: (row) => {
        const contract = asContract(row);
        if (!contract?.isAuction) return null;
        return contract.buyout !== undefined
          ? t('contractSearch.buyoutShort')
          : t('contractSearch.startingBidShort');
      },
    },
    {
      header: t('bpcContracts.plexAskColumn'),
      value: (row) => asContract(row)?.requestedPlex ?? null,
    },
    {
      header: t('bpcContracts.wholeContractColumn'),
      value: (row) => {
        const contract = asContract(row);
        return contract ? exportFlag(t, contract.isMultiType) : null;
      },
    },
    {
      header: t('bpcContracts.lpIskColumn'),
      value: (row) => (row.source === 'lp' ? row.iskCost : null),
    },
    {
      header: t('bpcContracts.lpCostColumn'),
      value: (row) => (row.source === 'lp' ? row.lpCost : null),
    },
    {
      header: t('bpcContracts.stationColumn'),
      value: (row) => (row.source === 'lp' ? row.stationName : null),
    },
    {
      header: t('bpcContracts.securityColumn'),
      value: (row) => context.securityFor(row),
    },
    {
      header: t('bpcContracts.atTradeHubColumn'),
      value: (row) => (row.source === 'market' ? exportFlag(t, row.atHub) : null),
    },
    {
      header: t('bpcContracts.bpoTooColumn'),
      value: (row) => exportFlag(t, context.bpoBadgeFor(row) !== null),
    },
    { header: t('bpcContracts.bpoPriceColumn'), value: (row) => context.bpoBadgeFor(row)?.price },
    {
      header: t('bpcContracts.bpoLocationColumn'),
      value: (row) => context.bpoBadgeFor(row)?.locationName,
    },
    {
      header: t('bpcContracts.bpoRegionColumn'),
      value: (row) => context.bpoBadgeFor(row)?.regionName,
    },
    {
      header: t('bpcContracts.bpoMayBeCheaperColumn'),
      value: (row) => {
        const badge = context.bpoBadgeFor(row);
        return badge ? exportFlag(t, badge.mayBeCheaper) : null;
      },
    },
    {
      header: t('bpcContracts.ownedColumn'),
      value: (row) => exportFlag(t, row.source === 'owned'),
    },
  ];
}
