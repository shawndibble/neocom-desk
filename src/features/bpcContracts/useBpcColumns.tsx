import { createNumberFormat } from '@/lib/numberLocale';
import { formatCount } from '@/lib/formatCount';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { COL_DATETIME, COL_SMALL_NUMBER } from '@/components/ui/dataTableWidths';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { DataTableDenseCell, IskAmount, sortRows, type DataTableColumn } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { SecurityStatus } from '@/components/SecurityStatus';
import {
  asContract,
  effectivePrice,
  iskPerRun,
  type BpcSearchRow,
} from '@/engine/contracts/bpcSearch';
import { canAskToCopy } from '@/engine/communities/askToCopy';
import { BpoBadge } from '@/features/bpcContracts/BpoBadge';
import { CommunityOfferCell } from '@/features/bpcContracts/CommunityOfferCell';
import {
  bpoBadgeRows,
  bpoMayBeCheaper,
  type BpoOffer,
} from '@/features/bpcContracts/bpoAvailability';
import {
  BPC_SEARCH_COLUMN_IDS,
  type BpcSearchColumnId,
} from '@/features/bpcContracts/bpcSearchColumns';
import { BPC_SOURCING_SORT_KEY } from './bpcSourcingUrl';
import { DenseOmit, QualityValue } from './BpcColumnCells';
import { OFFERS_DEFAULT_SORT, RESULT_LIMIT } from './bpcSourcingHelpers';
import { jumpsCellSortValue, renderJumpsCell } from '@/features/route/jumpsCell';
import type { JumpsCellValue } from '@/features/route/currentSystem';
import type { useSolarSystemIndex } from '@/features/route/useSolarSystems';
import { useIsPhone } from '@/lib/useIsPhone';
import { CONTRACT_ISK_CENTS_BELOW, formatIskAuto } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { useUrlSort } from '@/lib/useUrlState';

const formatDecimal = createNumberFormat({ maximumFractionDigits: 3 });

interface BpcColumnsInput {
  blueprintNames: ReadonlyMap<number, string>;
  regionNames: ReadonlyMap<number, string>;
  reactionFormulaTypeIds: ReadonlySet<number> | null;
  selectedTypeId: number | null;
  visibleColumns: readonly BpcSearchColumnId[];
  displayRows: BpcSearchRow[];
  bpoByType: ReadonlyMap<number, BpoOffer>;
  bpcRowJumps: (row: BpcSearchRow) => JumpsCellValue;
  solarSystems: ReturnType<typeof useSolarSystemIndex>;
  bpoLocationName: (bpo: BpoOffer) => string | null;
  regionLabel: (id: number) => string;
  onAsk: (row: Extract<BpcSearchRow, { source: 'community' }>) => void;
}

/** The table's columns, the sort, and the capped rows the sort keeps (`RESULT_LIMIT`). */
export function useBpcColumns({
  blueprintNames,
  regionNames,
  reactionFormulaTypeIds,
  selectedTypeId,
  visibleColumns,
  displayRows,
  bpoByType,
  bpcRowJumps,
  solarSystems,
  bpoLocationName,
  regionLabel,
  onAsk,
}: BpcColumnsInput) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const blueprintPicked = selectedTypeId !== null;
  const isPhone = useIsPhone();
  const bpcColumnsById = useMemo<Record<BpcSearchColumnId, DataTableColumn<BpcSearchRow>>>(
    () => ({
      source: {
        id: 'source',
        header: t('bpcContracts.sourceColumn'),
        width: '12ch',
        sortValue: (row) => row.source,
        render: (row) => (
          <span className={cx(eyebrowClassName, 'inline-flex items-center')}>
            {row.source === 'contract'
              ? t('bpcContracts.sourceContractSingular')
              : row.source === 'market'
                ? t('bpcContracts.sourceMarketSingular')
                : row.source === 'lp'
                  ? t('bpcContracts.sourceLpStoreSingular')
                  : row.source === 'community'
                    ? t('bpcContracts.sourceCommunitySingular')
                    : t('bpcContracts.sourceOwned')}
          </span>
        ),
      },
      location: {
        id: 'location',
        header: t('bpcContracts.locationColumn'),
        className: 'truncate',
        sortValue: (row) => (row.source === 'lp' ? row.corpName : (row.locationName ?? '')),
        render: (row) => {
          // An LP offer's place is its corporation; its nearest station, once found, sits beneath.
          const name =
            row.source === 'lp'
              ? row.corpName
              : (row.locationName ?? t('bpcContracts.notApplicable'));
          // The station's security after its name, the figure a buyer weighs
          // a trip by. On the phone card's meta line a fifty-character
          // station name is cut short — it opens with its system's name, so
          // "Jita IV - Moon 4 -…" still says where.
          const system = row.systemId == null ? undefined : solarSystems?.get(row.systemId);
          const place = (
            <>
              <span className="max-sm:inline-block max-sm:max-w-36 max-sm:truncate max-sm:align-bottom">
                {name}
              </span>
              {system && <SecurityStatus security={system.security} />}
              {row.source === 'lp' && row.stationName && (
                <span className="block truncate text-xs text-text-dim">{row.stationName}</span>
              )}
            </>
          );
          // The owner's #1240 rule for market BPOs: the whole region, the hub's own station marked.
          if (row.source !== 'market' || !row.atHub)
            return <DataTableDenseCell>{place}</DataTableDenseCell>;
          return (
            <span className="inline-flex flex-wrap items-center gap-x-1.5">
              {place}
              <span className="text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('bpcContracts.atTradeHub')}
              </span>
            </span>
          );
        },
      },
      jumps: {
        // A row's own distance from the Current System, independent of
        // whether the Jump Range filter above is even active
        // (`jumpFilter.jumps`/`jumpsStatus` are populated at every range,
        // `useJumpRangeFilter`). A row with no resolved system at all (still
        // loading, or ESI never placed it) sinks to a settled `null` — the
        // filter's own status has nothing to say about a row it never saw.
        id: 'jumps',
        header: t('bpcContracts.jumpsColumn'),
        width: COL_SMALL_NUMBER,
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => jumpsCellSortValue(bpcRowJumps(row)),
        // The dense phone card has no header row, and a bare "7" beside a
        // system name says nothing about what it counts.
        stackAffix: { before: t('bpcContracts.mobile.jumpsAffix') },
        render: (row) =>
          renderJumpsCell(bpcRowJumps(row), t, 'bpcContracts.jumpsUnavailableHint', row.systemId),
      },
      me: {
        id: 'me',
        header: t('bpcContracts.meColumn'),
        width: '6ch',
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.me,
        stackAffix: { before: t('bpcContracts.mobile.meAffix') },
        // Full text, not the meta line's dim: on the phone card the copy's
        // quality is what a buyer reads after its price.
        render: (row) => <QualityValue omitOnCard={blueprintPicked}>{row.me}</QualityValue>,
      },
      te: {
        id: 'te',
        header: t('bpcContracts.teColumn'),
        width: '6ch',
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.te,
        stackAffix: { before: t('bpcContracts.mobile.teAffix') },
        render: (row) => <QualityValue omitOnCard={blueprintPicked}>{row.te}</QualityValue>,
      },
      runs: {
        id: 'runs',
        header: t('bpcContracts.runsColumn'),
        width: COL_SMALL_NUMBER,
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.runs ?? undefined,
        stackAffix: { after: t('bpcContracts.mobile.runsAffix') },
        // A BPO's -1 renders as ∞, not a nonsensical negative count.
        render: (row) => (
          <QualityValue omitOnCard={blueprintPicked}>
            {row.runs === null
              ? t('bpcContracts.notApplicable')
              : row.runs === -1
                ? t('bpcContracts.unlimitedRuns')
                : row.runs}
          </QualityValue>
        ),
      },
      qty: {
        id: 'qty',
        header: t('bpcContracts.qtyColumn'),
        width: COL_SMALL_NUMBER,
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.quantity,
        stackAffix: { before: t('bpcContracts.mobile.qtyAffix') },
        render: (row) => row.quantity,
      },
      price: {
        id: 'price',
        header: t('bpcContracts.priceColumn'),
        width: '20ch',
        align: 'right',
        // The headline figure of the dense phone card, on the title line.
        cardCorner: true,
        className: 'tabular-nums whitespace-nowrap',
        // `effectivePrice`, not the `buyout ?? price` this used to inline: EVE
        // Ref's CSV carries a buyout on non-auction contracts too whenever the
        // field parses, so an item_exchange row with `buyout: 0` sorted to the
        // top of the table while rendering — and now summarising — at its real
        // price. An owned row costs nothing, so it sorts at 0 beside Community
        // rows: sorted last it fell past the result cap and never showed.
        sortValue: (row) => {
          if (row.source === 'market' || row.source === 'lp' || row.source === 'community') {
            return row.price;
          }
          const contract = asContract(row);
          if (!contract) return 0;
          // A PLEX-for-item barter's real ask isn't ISK at all (issue #1105)
          // — sorting it at its `0` ISK price would put it above every real
          // priced offer as "cheapest", which it isn't. Sorts last, unlike an
          // owned or Community row, whose free price is real.
          if (contract.requestedPlex) return Infinity;
          return effectivePrice(contract);
        },
        render: (row) => {
          if (row.source === 'market' || row.source === 'community') {
            return <IskAmount value={row.price} />;
          }
          if (row.source === 'owned') return <IskAmount value={0} />;
          if (row.source === 'lp') {
            return (
              <HintText
                desktopOnly
                content={t('bpcContracts.lpOfferCost', {
                  isk: formatDecimal(row.iskCost),
                  lp: formatCount(row.lpCost),
                })}
              >
                <IskAmount value={row.price} />
              </HintText>
            );
          }
          const contract = asContract(row);
          if (!contract) return t('bpcContracts.notApplicable');
          // An auction's figure carries a short "buyout"/"bid" tag after
          // it, Contract Search's own, rather than "Starting bid: 12,000,000"
          // — too wide for the phone card's headline corner, and the number
          // alone would read as a fixed ask. Sorting is unaffected:
          // `sortValue` reads `effectivePrice`. Long press, not tap: a row
          // tap opens the contract.
          //
          // A contract asking for PLEX (issue #1105) usually has an ISK
          // `price` of `0` — the ask is the PLEX, not a real zero — so its
          // requested quantity is shown here instead of the ISK figure
          // `sortValue` would otherwise reflect as "free". Some issuers ask
          // for both an ISK amount and PLEX in the same contract, so a real
          // (non-zero) price alongside `requestedPlex` is shown as both
          // figures rather than the PLEX one alone hiding the ISK ask.
          const amount = contract.requestedPlex ? (
            contract.price > 0 ? (
              t('bpcContracts.iskPlusPlexPrice', {
                isk: formatIskAuto(contract.price, CONTRACT_ISK_CENTS_BELOW),
                plex: formatCount(contract.requestedPlex),
              })
            ) : (
              t('bpcContracts.plexPrice', { plex: formatCount(contract.requestedPlex) })
            )
          ) : contract.isAuction ? (
            <>
              <IskAmount value={contract.buyout ?? contract.price} />
              <span className="ml-1 text-[0.6875rem] font-normal text-text-dim uppercase">
                {contract.buyout !== undefined
                  ? t('contractSearch.buyoutShort')
                  : t('contractSearch.startingBidShort')}
              </span>
            </>
          ) : (
            <IskAmount value={contract.price} />
          );
          // A multi-type contract's ask is real but indivisible (issue
          // #1076) — marked rather than attributed to this one blueprint;
          // the row itself already opens the contract detail, which prices
          // both sides of a bundle.
          if (!contract.isMultiType) return amount;
          return (
            // Right-hugging at every width: on the phone card the price is
            // the title line's right-hand figure, not a labelled field.
            <span className="flex flex-col items-end">
              <span>{amount}</span>
              <span className="text-[0.625rem] text-text-dim">
                {t('bpcContracts.wholeContractMarker')}
              </span>
            </span>
          );
        },
      },
      iskPerRun: {
        id: 'iskPerRun',
        header: t('bpcContracts.iskPerRunColumn'),
        width: '16ch',
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        // Same rule as the Courier board's ISK/jump: no rate sinks the row in
        // either direction, `undefined` rather than a sentinel that would lead
        // the table on one of them. An owned row has no asking price at all.
        sortValue: (row) => {
          const contract = asContract(row);
          if (!contract) return undefined;
          return (
            iskPerRun(
              effectivePrice(contract),
              contract.runs,
              contract.quantity,
              contract.isMultiType
            ) ?? undefined
          );
        },
        stackAffix: { after: t('bpcContracts.mobile.perRunAffix') },
        render: (row) => {
          const contract = asContract(row);
          if (!contract) return <DenseOmit>{t('bpcContracts.notApplicable')}</DenseOmit>;
          const rate = iskPerRun(
            effectivePrice(contract),
            contract.runs,
            contract.quantity,
            contract.isMultiType
          );
          if (rate === null) return <DenseOmit>{t('bpcContracts.notApplicable')}</DenseOmit>;
          return formatIskAuto(rate, CONTRACT_ISK_CENTS_BELOW);
        },
      },
      region: {
        id: 'region',
        header: t('bpcContracts.regionColumn'),
        width: '18ch',
        className: 'truncate',
        // An owned row's `regionId` comes from its resolved location
        // (issue #796) rather than `contract.regionId` — before that
        // resolution existed this column had nothing to show an owned row at
        // all, which is the "—" the issue reported.
        sortValue: (row) => {
          const regionId = row.source === 'contract' ? row.contract.regionId : row.regionId;
          return regionId == null ? '' : (regionNames.get(regionId) ?? `#${regionId}`);
        },
        render: (row) => {
          const regionId = row.source === 'contract' ? row.contract.regionId : row.regionId;
          return regionId == null
            ? t('bpcContracts.notApplicable')
            : (regionNames.get(regionId) ?? `#${regionId}`);
        },
      },
      space: {
        id: 'space',
        header: t('bpcContracts.spaceColumn'),
        width: '12ch',
        sortValue: (row) => row.space ?? '',
        render: (row) =>
          row.space ? t(`common.spaceOption.${row.space}`) : t('bpcContracts.notApplicable'),
      },
      expires: {
        id: 'expires',
        header: t('bpcContracts.expiresColumn'),
        width: COL_DATETIME,
        className: 'whitespace-nowrap text-text-dim',
        // Infinity sorts an owned row last, rather than epoch 0 reading as
        // "expires soonest."
        sortValue: (row) => asContract(row)?.dateExpired ?? Infinity,
        stackAffix: { before: t('bpcContracts.mobile.expiresAffix') },
        render: (row) => {
          const contract = asContract(row);
          return contract ? (
            formatTimestamp(new Date(contract.dateExpired), timeZone)
          ) : (
            <DenseOmit>{t('bpcContracts.notApplicable')}</DenseOmit>
          );
        },
      },
    }),
    [t, regionNames, timeZone, bpcRowJumps, solarSystems, blueprintPicked]
  );

  const itemSortValue = useCallback(
    (row: BpcSearchRow) => blueprintNames.get(row.typeId) ?? `#${row.typeId}`,
    [blueprintNames]
  );
  // In table order. Shared by `columns` below and the sort, which is resolved
  // before `columns` exists: the cap sorts first, and the badges the Item
  // column renders are picked from what it keeps.
  const shownColumnIds = useMemo(
    () => BPC_SEARCH_COLUMN_IDS.filter((id) => visibleColumns.includes(id)),
    [visibleColumns]
  );
  const sortColumnIds = useMemo(() => ['item', ...shownColumnIds], [shownColumnIds]);
  const sortProps = useUrlSort(BPC_SOURCING_SORT_KEY, OFFERS_DEFAULT_SORT, sortColumnIds);
  // The top `RESULT_LIMIT` rows by the table's own sort (`sortRows` is the
  // rule `DataTable` sorts with), so the cap keeps the cheapest copies under
  // the default Price sort, the nearest under Jumps, and so on. The sort is
  // stable, so ties keep `displayRows`' source order (the hidden secondary
  // sort, `rankBpcOffers`); `DataTable`'s own re-sort preserves it too.
  const shownRows = useMemo(() => {
    const { columnId, direction } = sortProps.sort;
    const column =
      columnId === 'item'
        ? { sortValue: itemSortValue }
        : bpcColumnsById[columnId as BpcSearchColumnId];
    const sorted = column ? sortRows(displayRows, column, direction) : displayRows;
    return sorted.slice(0, RESULT_LIMIT);
  }, [displayRows, sortProps.sort, itemSortValue, bpcColumnsById]);
  // With several blueprints listed, one copy row per type carries the BPO
  // badge; with one picked, the callout cards say it instead (issue #1241).
  // Picked from the shown rows, so the cap never drops a type's only badge.
  const badgedRows = useMemo(
    () => (selectedTypeId === null ? bpoBadgeRows(shownRows) : new Set<BpcSearchRow>()),
    [selectedTypeId, shownRows]
  );

  const columns = useMemo<DataTableColumn<BpcSearchRow>[]>(() => {
    const cols: DataTableColumn<BpcSearchRow>[] = [
      {
        id: 'item',
        header: t('bpcContracts.itemColumn'),
        primary: true,
        className: 'truncate',
        sortValue: itemSortValue,
        render: (row) => {
          const name = blueprintNames.get(row.typeId) ?? `#${row.typeId}`;
          // A BPO row is the BPO itself; only a copy gets the "BPO too" badge,
          // and only one copy per type (`bpoBadgeRows`).
          const bpo = badgedRows.has(row) ? bpoByType.get(row.typeId) : undefined;
          // An owned copy has no price column to mark it apart from a for-sale
          // one, so the Item cell carries the tag instead — independent of
          // which columns are visible.
          const owned = row.source === 'owned';
          // One blueprint picked: every phone card would repeat its name, so
          // the card's title is the copy's quality instead, and ME/TE/runs
          // leave the meta line under it (`QualityValue`). The table keeps
          // the name.
          // Decided in JS (`useIsPhone`, the line `DataTable` stacks at), not
          // a CSS pair, so the cell holds one title at any width.
          const title =
            blueprintPicked && isPhone ? (
              <span className="tabular-nums">
                {t('bpcContracts.mobile.copyQuality', {
                  me: row.me,
                  te: row.te,
                  runs: row.runs === -1 ? t('bpcContracts.unlimitedRuns') : row.runs,
                })}
              </span>
            ) : (
              // Ellipsised on the phone card, so a long name stops short of the
              // price beside it instead of running under it.
              // Plain text: the row opens the contract modal (which lists the
              // item with its Market link) or, for a market row, the item's
              // Market entry (DESIGN.md §6c, a row's primary action beats
              // name links inside it).
              <span className={entityLinkClassName('block truncate')}>{name}</span>
            );
          if (row.source === 'community') {
            return (
              <CommunityOfferCell
                row={row}
                title={title}
                canAsk={canAskToCopy(row, reactionFormulaTypeIds)}
                onAsk={() => onAsk(row)}
              />
            );
          }
          if (!bpo && !owned) return title;
          return (
            // One wrapping line on the phone card, so a tag sits beside the
            // name rather than pushing the title line into three.
            <span className="flex min-w-0 flex-wrap items-center gap-1.5 sm:flex-col sm:flex-nowrap sm:items-start sm:gap-1">
              <span className="min-w-0 max-w-full">{title}</span>
              {owned && (
                <span className="inline-flex w-fit items-center text-[0.6875rem] font-normal text-text-dim">
                  {t('bpcContracts.sourceOwned')}
                </span>
              )}
              {bpo && (
                <BpoBadge
                  bpo={bpo}
                  mayBeCheaper={row.source === 'contract' && bpoMayBeCheaper(bpo, row.contract)}
                  locationName={bpoLocationName(bpo)}
                  regionName={regionLabel(bpo.regionId)}
                />
              )}
            </span>
          );
        },
      },
    ];
    for (const id of shownColumnIds) cols.push(bpcColumnsById[id]);
    return cols;
  }, [
    t,
    blueprintNames,
    itemSortValue,
    shownColumnIds,
    bpcColumnsById,
    bpoByType,
    badgedRows,
    bpoLocationName,
    regionLabel,
    blueprintPicked,
    isPhone,
    reactionFormulaTypeIds,
    onAsk,
  ]);

  return { bpcColumnsById, columns, shownRows, sortProps };
}
