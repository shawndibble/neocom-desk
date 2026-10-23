/**
 * The Items table's column set and CSV columns, split out of
 * `ContractSearchPanel`. Also hands back the two cell helpers the panel's
 * detail modal and jumps readout share.
 */
import { formatCount } from '@/lib/formatCount';
import { useCallback, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IskAmount, type DataTableColumn } from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { SecurityStatus } from '@/components/SecurityStatus';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { isUnpricedOffer, offerAskingPrice } from '@/engine/contracts/contractSearch';
import {
  CONTRACT_SEARCH_ITEMS_COLUMN_IDS,
  type ContractSearchItemsColumnId,
} from '@/features/contractSearch/contractSearchItemsColumns';
import { contractSearchCsvColumns } from '@/features/contractSearch/contractSearchCsv';
import type { OfferLocation } from '@/features/contractSearch/offerLocations';
import type { JumpsCellValue, useJumpRangeFilter } from '@/features/route/currentSystem';
import { renderJumpsCell } from '@/features/route/jumpsCell';
import { CONTRACT_ISK_CENTS_BELOW, formatIskAuto } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';

/**
 * The Price column's own `sortValue` — `undefined`, not `Infinity`, for an
 * unpriced row: `DataTable.sortRows` appends every `undefined` row after
 * the sorted, valued ones regardless of sort direction, the same
 * "unknowable sorts last either way" rule `BpcSourcingPanel.tsx`'s ISK/run
 * column already follows for its own `undefined`.
 */
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
  /** The marker before a row's price, or nothing: the flag judgement lives with the caller. */
  priceFlag?: (row: PublicContractOfferRow) => ReactNode;
}

export function useItemsColumns({
  typeNames,
  regionNames,
  offerLocations,
  jumpRangeFilter,
  plexPrice,
  visibleItemsColumns,
  priceFlag,
}: ItemsColumnsInput) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();

  /**
   * A row's own distance from the Current System, independent of whether a
   * Jump Range filter is even active (`jumpRangeFilter.jumps`/`jumpsStatus`
   * are populated at every range). Pending while *either* the offer's own
   * location (`offerLocations`) or the distance map is still resolving; a
   * settled but unplaced offer (a player structure, or nothing this app
   * could place) is a `value` of `null`, same as an unreachable system.
   */
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

  /**
   * A PLEX ask as the contract states it — "100 PLEX", or "20M ISK + 10 PLEX"
   * when it wants both — for wherever no PLEX price is in hand to fold it into
   * one ISK figure.
   */
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
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.quantity,
        render: (row) => formatCount(row.quantity),
        // The dense phone card has no header row, and a bare "12" beside a
        // system name says nothing about what it counts.
        stackAffix: { before: t('contractSearch.mobile.qtyAffix') },
      },
      price: {
        id: 'price',
        header: t('contractSearch.priceColumn'),
        align: 'right',
        // The headline figure of the dense phone card, on the title line.
        cardCorner: true,
        className: 'tabular-nums whitespace-nowrap',
        sortValue: (row) => sortValueForPriceColumn(row, plexPrice),
        render: (row) => (
          <>
            {row.requestedPlex && plexPrice === null ? (
              // No PLEX price to convert at yet: state the ask as it stands.
              plexAskLabel(row)
            ) : (
              // Long press, not tap: the row's own tap opens the offer's detail modal.
              <>
                {priceFlag?.(row)}
                <IskAmount value={offerAskingPrice(row, plexPrice)} />
              </>
            )}
            {row.isAuction && (
              // An auction's number is a starting bid unless the seller set a
              // buyout, so the figure alone would read as a fixed ask.
              <span className="ml-1 text-[0.6875rem] text-text-dim uppercase">
                {row.buyout
                  ? t('contractSearch.buyoutShort')
                  : t('contractSearch.startingBidShort')}
              </span>
            )}
            {row.requestedPlex
              ? plexPrice !== null && (
                  // The figure above already counts the PLEX at market; say so,
                  // since the contract itself asks for PLEX, not that much ISK.
                  <span className="block text-[0.625rem] text-text-dim">
                    {t('contractSearch.includesPlex', {
                      plex: formatCount(row.requestedPlex),
                    })}
                  </span>
                )
              : isUnpricedOffer(row) && (
                  // A barter's 0 ISK is real but not a price (issue #1080) — the
                  // row's own tap already opens the detail modal, which shows
                  // both sides of the exchange correctly.
                  <span className="block text-[0.625rem] text-text-dim">
                    {t('contractSearch.unpricedOfferMarker')}
                  </span>
                )}
          </>
        ),
      },
      system: {
        // The system, with its security, is what a buyer actually weighs —
        // whether the pickup is a hop from home or a trip into lowsec — and a
        // region alone cannot say either. After Price so the phone card's
        // meta line reads "Qty · System · Region · Exp", narrowest place last.
        id: 'system',
        header: t('contractSearch.systemColumn'),
        className: 'whitespace-nowrap',
        // Unplaced or still resolving sinks in either direction, rather than
        // sorting as a name — the Price column's "unknowable sorts last" rule.
        sortValue: (row) => offerLocations.get(row.locationId)?.systemName ?? undefined,
        render: (row) => {
          const location = offerLocations.get(row.locationId);
          // Missing key: the local lookup has not answered yet. Distinct from
          // a null name, which is a finished answer — a player structure, or
          // a table that could not be read — and must not read as pending.
          if (location === undefined) return <span className="text-text-dim">…</span>;
          if (location.systemName === null) return <span className="text-text-dim">—</span>;
          return (
            <>
              {/* Plain: the row opens the contract modal, which carries the system link. */}
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
        align: 'right',
        className: 'tabular-nums',
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
        sortValue: (row) => regionNames.get(row.regionId) ?? `#${row.regionId}`,
        render: (row) => regionNames.get(row.regionId) ?? `#${row.regionId}`,
      },
      expires: {
        id: 'expires',
        header: t('contractSearch.expiresColumn'),
        className: 'whitespace-nowrap text-text-dim',
        sortValue: (row) => row.dateExpired,
        render: (row) => formatTimestamp(new Date(row.dateExpired), timeZone),
        stackAffix: { before: t('contractSearch.mobile.expiresAffix') },
      },
    }),
    [t, regionNames, offerLocations, timeZone, offerJumps, plexPrice, plexAskLabel, priceFlag]
  );

  const columns = useMemo<DataTableColumn<PublicContractOfferRow>[]>(() => {
    const cols: DataTableColumn<PublicContractOfferRow>[] = [
      {
        id: 'item',
        header: t('contractSearch.itemColumn'),
        primary: true,
        sortValue: (row) => typeNames.get(row.typeId) ?? `#${row.typeId}`,
        render: (row) => (
          // Plain: the row opens the contract modal, whose item lines link to Market.
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
      }),
    [t, typeNames, regionNames, offerLocations, offerJumps, plexPrice]
  );

  return { columns, itemsColumnsById, itemsCsvColumns, offerJumps, plexAskLabel };
}
