import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import {
  asContract,
  effectivePrice,
  iskPerRun,
  type BpcContractRow,
  type BpcSearchRow,
} from '@/engine/contracts/bpcSearch';
import { auctionKindLabel } from '@/features/contractSearch/contractFlagText';
import { exportFlag } from '@/lib/exportFlag';
import { BPC_SEARCH_COLUMN_IDS, type BpcSearchColumnId } from './bpcSearchColumns';

export interface BpcBpoBadge {
  price: number;
  locationName: string | null;
  regionName: string;
  mayBeCheaper: boolean;
}

export interface BpcSourcingCsvContext {
  nameFor: (typeId: number) => string;
  regionName: (regionId: number) => string;
  jumpsFor: (row: BpcSearchRow) => number | null;
  securityFor: (row: BpcSearchRow) => number | null;
  peerDiffFor: (row: BpcContractRow) => number | null;
  bpoBadges: ReadonlyMap<BpcSearchRow, BpcBpoBadge>;
}

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

export function bpcSourcingCsvColumns(
  t: CsvTranslate,
  context: BpcSourcingCsvContext
): CsvColumn<BpcSearchRow>[] {
  const badgeOf = (row: BpcSearchRow) => context.bpoBadges.get(row) ?? null;
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
    vsPeers: {
      header: t('bpcContracts.vsPeersColumn'),
      value: (row) => {
        const contract = asContract(row);
        const diff = contract ? context.peerDiffFor(contract) : null;
        return diff === null ? null : Math.round(diff * 10) / 10;
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
      header: t('contracts.typeAuction'),
      value: (row) => {
        const contract = asContract(row);
        if (!contract?.isAuction) return null;
        return auctionKindLabel(t, contract.buyout);
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
      header: t('market.securityColumn'),
      value: (row) => context.securityFor(row),
    },
    {
      header: t('bpcContracts.atTradeHubColumn'),
      value: (row) => (row.source === 'market' ? exportFlag(t, row.atHub) : null),
    },
    {
      header: t('bpcContracts.bpoTooColumn'),
      value: (row) => exportFlag(t, badgeOf(row) !== null),
    },
    { header: t('bpcContracts.bpoPriceColumn'), value: (row) => badgeOf(row)?.price },
    {
      header: t('bpcContracts.bpoLocationColumn'),
      value: (row) => badgeOf(row)?.locationName,
    },
    {
      header: t('bpcContracts.bpoRegionColumn'),
      value: (row) => badgeOf(row)?.regionName,
    },
    {
      header: t('bpcContracts.bpoMayBeCheaperColumn'),
      value: (row) => {
        const badge = badgeOf(row);
        return badge ? exportFlag(t, badge.mayBeCheaper) : null;
      },
    },
    {
      header: t('bpcContracts.ownedColumn'),
      value: (row) => exportFlag(t, row.source === 'owned'),
    },
  ];
}
