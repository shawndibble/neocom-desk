import { formatCount } from '@/lib/formatCount';
import { useCallback, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IskAmount, type DataTableColumn } from '@/components/ui';
import { COL_DATETIME, COL_SMALL_NUMBER } from '@/components/ui/dataTableWidths';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { SecurityStatus } from '@/components/SecurityStatus';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import type { ContractFlag } from '@/engine/contracts/contractFlags';
import { formatSignedPercent, savingTone } from '@/lib/formatSignedPercent';
import {
  isUnpricedOffer,
  offerAskingPrice,
  offerUnitPrice,
} from '@/engine/contracts/contractSearch';
import {
  CONTRACT_SEARCH_ITEMS_COLUMN_IDS,
  type ContractSearchItemsColumnId,
} from '@/features/contractSearch/contractSearchItemsColumns';
import { auctionKindLabel } from '@/features/contractSearch/contractFlagText';
import { contractSearchCsvColumns } from '@/features/contractSearch/contractSearchCsv';
import type { OfferLocation } from '@/features/contractSearch/offerLocations';
import type { JumpsCellValue, useJumpRangeFilter } from '@/features/route/currentSystem';
import { renderJumpsCell } from '@/features/route/jumpsCell';
import { CONTRACT_ISK_CENTS_BELOW, formatIskAuto } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';

function sortValueForPriceColumn(
  row: PublicContractOfferRow,
  plexPrice: number | null
): number | undefined {
  return isUnpricedOffer(row, plexPrice) ? undefined : offerAskingPrice(row, plexPrice);
}

interface ItemsColumnsInput {
  typeNames: ReadonlyMap<number, string>;
  regionNames: ReadonlyMap<number, string>;
  offerLocations: ReadonlyMap<number, OfferLocation>;
  jumpRangeFilter: ReturnType<typeof useJumpRangeFilter>;
  plexPrice: number | null;
  visibleItemsColumns: readonly ContractSearchItemsColumnId[];
  priceFlag?: (row: PublicContractOfferRow) => ReactNode;
  flagFor?: (row: PublicContractOfferRow) => ContractFlag | null;
  savingFor?: (row: PublicContractOfferRow) => number | null;
}

export function useItemsColumns({
  typeNames,
  regionNames,
  offerLocations,
  jumpRangeFilter,
  plexPrice,
  visibleItemsColumns,
  priceFlag,
  flagFor,
  savingFor,
}: ItemsColumnsInput) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();

  const offerJumps = useCallback(
    (row: PublicContractOfferRow): JumpsCellValue => {
      const location = offerLocations.get(row.locationId);
      if (location === undefined) return { kind: 'loading' };
      if (location.systemId === null) return { kind: 'value', count: null };
      if (jumpRangeFilter.jumpsStatus !== 'ready') return { kind: jumpRangeFilter.jumpsStatus };
      return { kind: 'value', count: jumpRangeFilter.jumps?.get(location.systemId) ?? null };
    },
    [offerLocations, jumpRangeFilter]
  );

  const plexAskLabel = useCallback(
    (row: PublicContractOfferRow): string => {
      const plex = formatCount(row.requestedPlex ?? 0);
      return row.price > 0
        ? t('contractSearch.iskPlusPlexPrice', {
            isk: formatIskAuto(row.price, CONTRACT_ISK_CENTS_BELOW),
            plex,
          })
        : t('contractSearch.plexPrice', { plex });
    },
    [t]
  );

  const itemsColumnsById = useMemo<
    Record<ContractSearchItemsColumnId, DataTableColumn<PublicContractOfferRow>>
  >(
    () => ({
      qty: {
        id: 'qty',
        header: t('contractSearch.qtyColumn'),
        width: '13.5ch',
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        sortValue: (row) => row.quantity,
        render: (row) => formatCount(row.quantity),
        stackAffix: { before: t('contractSearch.mobile.qtyAffix') },
      },
      iskPerUnit: {
        id: 'iskPerUnit',
        header: t('contractSearch.iskPerUnitColumn'),
        width: '10.5ch',
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        sortFirst: 'asc',
        sortValue: (row) => offerUnitPrice(row, plexPrice),
        render: (row) => {
          const unit = offerUnitPrice(row, plexPrice);
          return unit === undefined ? '–' : <IskAmount value={unit} />;
        },
        stackAffix: { after: t('contractSearch.mobile.perUnitAffix') },
      },
      price: {
        id: 'price',
        header: t('contractSearch.priceColumn'),
        width: '18ch',
        align: 'right',
        cardCorner: true,
        className: 'tabular-nums whitespace-nowrap',
        sortFirst: 'asc',
        sortValue: (row) => sortValueForPriceColumn(row, plexPrice),
        render: (row) => (
          <>
            {row.requestedPlex && plexPrice === null ? (
              plexAskLabel(row)
            ) : (
              <>
                {priceFlag?.(row)}
                <IskAmount value={offerAskingPrice(row, plexPrice)} />
              </>
            )}
            {row.isAuction && (
              <span className="ml-1 text-[0.6875rem] text-text-dim uppercase">
                {auctionKindLabel(t, row.buyout)}
              </span>
            )}
            {row.requestedPlex
              ? plexPrice !== null && (
                  <span className="block text-[0.6875rem] text-text-dim">
                    {t('contractSearch.includesPlex', {
                      plex: formatCount(row.requestedPlex),
                    })}
                  </span>
                )
              : isUnpricedOffer(row) && (
                  <span className="block text-[0.6875rem] text-text-dim">
                    {t('contractSearch.unpricedOfferMarker')}
                  </span>
                )}
          </>
        ),
      },
      saving: {
        id: 'saving',
        header: t('contractSearch.savingColumn'),
        width: '9.5ch',
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        sortFirst: 'desc',
        sortValue: (row) => savingFor?.(row) ?? undefined,
        stackAffix: { after: t('contractSearch.mobile.savingAffix') },
        render: (row) => {
          const saving = savingFor?.(row) ?? null;
          if (saving === null) return <span className="text-text-dim">–</span>;
          return (
            <span className={savingTone(saving) === 'good' ? 'text-isk-pos' : 'text-isk-neg'}>
              {formatSignedPercent(saving)}
            </span>
          );
        },
      },
      system: {
        id: 'system',
        header: t('contractSearch.systemColumn'),
        width: '14ch',
        className: 'whitespace-nowrap',
        sortValue: (row) => offerLocations.get(row.locationId)?.systemName ?? undefined,
        render: (row) => {
          const location = offerLocations.get(row.locationId);
          if (location === undefined) return <span className="text-text-dim">…</span>;
          if (location.systemName === null) return <span className="text-text-dim">—</span>;
          return (
            <>
              <span>{location.systemName}</span>
              {location.security !== null && (
                <>
                  {' '}
                  <SecurityStatus security={location.security} />
                </>
              )}
            </>
          );
        },
      },
      jumps: {
        id: 'jumps',
        header: t('contractSearch.itemsJumpsColumn'),
        width: COL_SMALL_NUMBER,
        align: 'right',
        className: 'tabular-nums',
        sortFirst: 'asc',
        sortValue: (row) => {
          const cell = offerJumps(row);
          return cell.kind === 'value' ? (cell.count ?? undefined) : undefined;
        },
        stackAffix: { before: t('contractSearch.mobile.jumpsAffix') },
        render: (row) =>
          renderJumpsCell(
            offerJumps(row),
            t,
            'contractSearch.jumpsUnavailableHint',
            offerLocations.get(row.locationId)?.systemId
          ),
      },
      region: {
        id: 'region',
        header: t('contractSearch.regionColumn'),
        width: '18ch',
        className: 'truncate',
        sortValue: (row) => regionNames.get(row.regionId) ?? `#${row.regionId}`,
        render: (row) => regionNames.get(row.regionId) ?? `#${row.regionId}`,
      },
      expires: {
        id: 'expires',
        header: t('contractSearch.expiresColumn'),
        width: COL_DATETIME,
        className: 'whitespace-nowrap text-text-dim',
        sortValue: (row) => row.dateExpired,
        render: (row) => formatTimestamp(new Date(row.dateExpired), timeZone),
        stackAffix: { before: t('contractSearch.mobile.expiresAffix') },
      },
    }),
    [
      t,
      regionNames,
      offerLocations,
      timeZone,
      offerJumps,
      plexPrice,
      plexAskLabel,
      priceFlag,
      savingFor,
    ]
  );

  const columns = useMemo<DataTableColumn<PublicContractOfferRow>[]>(() => {
    const cols: DataTableColumn<PublicContractOfferRow>[] = [
      {
        id: 'item',
        header: t('contractSearch.itemColumn'),
        primary: true,
        className: 'truncate',
        sortValue: (row) => typeNames.get(row.typeId) ?? `#${row.typeId}`,
        render: (row) => (
          <span className={entityLinkClassName()}>
            {typeNames.get(row.typeId) ?? `#${row.typeId}`}
          </span>
        ),
      },
    ];
    for (const id of CONTRACT_SEARCH_ITEMS_COLUMN_IDS) {
      if (visibleItemsColumns.includes(id)) cols.push(itemsColumnsById[id]);
    }
    return cols;
  }, [t, typeNames, visibleItemsColumns, itemsColumnsById]);

  const itemsCsvColumns = useMemo(
    () =>
      contractSearchCsvColumns(t, {
        typeName: (typeId) => typeNames.get(typeId) ?? `#${typeId}`,
        regionName: (regionId) => regionNames.get(regionId) ?? `#${regionId}`,
        systemName: (row) => offerLocations.get(row.locationId)?.systemName ?? null,
        jumps: (row) => {
          const cell = offerJumps(row);
          return cell.kind === 'value' ? cell.count : null;
        },
        plexPrice,
        security: (row) => offerLocations.get(row.locationId)?.security ?? null,
        flagFor: (row) => flagFor?.(row) ?? null,
      }),
    [t, typeNames, regionNames, offerLocations, offerJumps, plexPrice, flagFor]
  );

  return { columns, itemsColumnsById, itemsCsvColumns, offerJumps, plexAskLabel };
}
