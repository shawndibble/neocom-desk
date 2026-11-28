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
  type BpcContractRow,
  type BpcSearchRow,
} from '@/engine/contracts/bpcSearch';
import { formatSignedPercent } from '@/lib/formatSignedPercent';
import { auctionKindLabel } from '@/features/contractSearch/contractFlagText';
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
  peerDiffOf: (row: BpcContractRow) => number | null;
  bpoByType: ReadonlyMap<number, BpoOffer>;
  bpcRowJumps: (row: BpcSearchRow) => JumpsCellValue;
  solarSystems: ReturnType<typeof useSolarSystemIndex>;
  bpoLocationName: (bpo: BpoOffer) => string | null;
  regionLabel: (id: number) => string;
  onAsk: (row: Extract<BpcSearchRow, { source: 'community' }>) => void;
}

export function useBpcColumns({
  blueprintNames,
  regionNames,
  reactionFormulaTypeIds,
  selectedTypeId,
  visibleColumns,
  displayRows,
  peerDiffOf,
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
          const name =
            row.source === 'lp'
              ? row.corpName
              : (row.locationName ?? t('bpcContracts.notApplicable'));
          const system = row.systemId == null ? undefined : solarSystems?.get(row.systemId);
          const security = system && <SecurityStatus security={system.security} />;
          const place = (
            <>
              <span className="max-sm:inline-block max-sm:max-w-36 max-sm:truncate max-sm:align-bottom">
                {name}
              </span>
              {row.source === 'lp'
                ? row.stationName && (
                    <span className="block truncate text-xs text-text-dim max-sm:whitespace-normal">
                      {row.stationName}
                      {security && ' '}
                      {security}
                    </span>
                  )
                : security}
            </>
          );
          if (row.source !== 'market' || !row.atHub)
            return <DataTableDenseCell>{place}</DataTableDenseCell>;
          return (
            <span className="inline-flex flex-wrap items-center gap-x-1.5">
              {place}
              <span className={eyebrowClassName}>{t('bpcContracts.atTradeHub')}</span>
            </span>
          );
        },
      },
      jumps: {
        id: 'jumps',
        header: t('bpcContracts.jumpsColumn'),
        width: COL_SMALL_NUMBER,
        align: 'right',
        className: 'tabular-nums',
        sortFirst: 'asc',
        sortValue: (row) => jumpsCellSortValue(bpcRowJumps(row)),
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
        width: '15ch',
        align: 'right',
        cardCorner: true,
        className: 'tabular-nums whitespace-nowrap',
        sortFirst: 'asc',
        sortValue: (row) => {
          if (row.source === 'market' || row.source === 'lp' || row.source === 'community') {
            return row.price;
          }
          const contract = asContract(row);
          if (!contract) return 0;
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
                {auctionKindLabel(t, contract.buyout)}
              </span>
            </>
          ) : (
            <IskAmount value={contract.price} />
          );
          if (!contract.isMultiType) return amount;
          return (
            <span className="flex flex-col items-end">
              <span>{amount}</span>
              <span className="text-[0.6875rem] text-text-dim">
                {t('bpcContracts.wholeContractMarker')}
              </span>
            </span>
          );
        },
      },
      iskPerRun: {
        id: 'iskPerRun',
        header: t('bpcContracts.iskPerRunColumn'),
        width: '15.5ch',
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
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
      vsPeers: {
        id: 'vsPeers',
        header: t('bpcContracts.vsPeersColumn'),
        width: '12ch',
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        sortValue: (row) => {
          const contract = asContract(row);
          return contract ? (peerDiffOf(contract) ?? undefined) : undefined;
        },
        render: (row) => {
          const contract = asContract(row);
          const diff = contract ? peerDiffOf(contract) : null;
          return diff === null ? null : formatSignedPercent(diff);
        },
      },
      region: {
        id: 'region',
        header: t('bpcContracts.regionColumn'),
        width: '18ch',
        className: 'truncate',
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
        width: '10ch',
        sortValue: (row) => row.space ?? '',
        render: (row) =>
          row.space ? t(`common.spaceOption.${row.space}`) : t('bpcContracts.notApplicable'),
      },
      expires: {
        id: 'expires',
        header: t('bpcContracts.expiresColumn'),
        width: COL_DATETIME,
        className: 'whitespace-nowrap text-text-dim',
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
    [t, regionNames, timeZone, bpcRowJumps, solarSystems, blueprintPicked, peerDiffOf]
  );

  const itemSortValue = useCallback(
    (row: BpcSearchRow) => blueprintNames.get(row.typeId) ?? `#${row.typeId}`,
    [blueprintNames]
  );
  const shownColumnIds = useMemo(
    () => BPC_SEARCH_COLUMN_IDS.filter((id) => visibleColumns.includes(id)),
    [visibleColumns]
  );
  const sortColumnIds = useMemo(() => ['item', ...shownColumnIds], [shownColumnIds]);
  const sortProps = useUrlSort(BPC_SOURCING_SORT_KEY, OFFERS_DEFAULT_SORT, sortColumnIds);
  const shownRows = useMemo(() => {
    const { columnId, direction } = sortProps.sort;
    const column =
      columnId === 'item'
        ? { sortValue: itemSortValue }
        : bpcColumnsById[columnId as BpcSearchColumnId];
    const sorted = column ? sortRows(displayRows, column, direction) : displayRows;
    return sorted.slice(0, RESULT_LIMIT);
  }, [displayRows, sortProps.sort, itemSortValue, bpcColumnsById]);
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
        width: '28ch',
        className: 'truncate',
        sortValue: itemSortValue,
        render: (row) => {
          const name = blueprintNames.get(row.typeId) ?? `#${row.typeId}`;
          const bpo = badgedRows.has(row) ? bpoByType.get(row.typeId) : undefined;
          const owned = row.source === 'owned';
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
