import { useMemo, type ReactElement } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useTranslation } from 'react-i18next';
import { MenuItem, MenuSeparator, type DataTableColumn } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { useTableExport } from '@/components/ui/useTableExport';
import { lpBeatsMarket, type RefineBasis } from '@/engine/market/appraisal';
import { pileFigures, rowFigures } from '@/engine/market/appraisalRowFigures';
import { looksLikeEftFit } from '@/engine/import/eftFit';
import { subtractOwned, type OwnedRow } from '@/engine/market/appraisalOwned';
import type { ResolvedStandings } from '@/engine/market/standings';
import { removeItemFromPaste } from '@/engine/market/appraisalPaste';
import { LpStoreLink } from '@/features/loyalty/LpStoreLink';
import { formatIskAuto } from '@/lib/isk';
import { useIsPhone } from '@/lib/useIsPhone';
import { useMediaQuery } from '@/lib/useMediaQuery';
import {
  APPRAISAL_COLUMN_IDS,
  DEFAULT_VISIBLE_APPRAISAL_COLUMNS,
  useVisibleAppraisalColumns,
  type AppraisalColumnId,
} from './appraisalColumns';
import { comparisonCell, eachCell, totalCell } from './appraisalCells';
import { RefineFigureButton } from './RefineFigureButton';
import { TurnInDetail, TurnInFigureButton } from '@/features/campaigns/TurnInDetail';
import { approxIsk } from '@/features/campaigns/turnInContent';
import { formatIskCompact } from '@/lib/isk';
import type { AppraisalTurnIns, RowTurnIn } from './useAppraisalTurnIns';
import { appraisalCsvColumns } from './appraisalCsv';
import { appraisalIskPerM3Column, appraisalVolumeColumn } from './appraisalVolume';
import { formatVolume } from './format';
import { ItemContextMenu } from './ItemContextMenu';
import { PriceMark } from './LivePriceStatus';
import { MarketItemLink } from './MarketItemLink';
import type { AppraisalController } from './useAppraisal';

const COMPACT_RESULTS_QUERY = '(min-width: 64rem) and (max-width: 79.999rem)';
const COMPACT_OFF_BY_DEFAULT: readonly AppraisalColumnId[] = ['buyEach', 'sellEach', 'volume'];
const MEDIUM_RESULTS_QUERY = '(min-width: 64rem) and (max-width: 89.999rem)';
const MEDIUM_OFF_BY_DEFAULT: readonly AppraisalColumnId[] = ['refineWithLeftover'];
const PRICE_MARK_COLUMNS: ReadonlySet<AppraisalColumnId> = new Set([
  'buyEach',
  'sellEach',
  'buyTotal',
  'sellTotal',
]);
const PHONE_ON_BY_DEFAULT: readonly AppraisalColumnId[] = ['buyTotal', 'sellTotal'];

export function useAppraisalColumns({
  controller,
  owned,
  standing,
  onOpenRefine,
  refineBasis,
  refineReady = true,
  turnIns,
}: {
  controller: AppraisalController;
  owned: ReadonlyMap<number, number> | null;
  standing: ResolvedStandings;
  onOpenRefine?: (typeId: number) => void;
  refineBasis: RefineBasis;
  refineReady?: boolean;
  turnIns?: Pick<AppraisalTurnIns, 'rowTurnIn' | 'any'>;
}) {
  const { t } = useTranslation();
  const { text, result } = controller;
  const storedColumns = useVisibleAppraisalColumns((state) => state.value);
  const compactResults = useMediaQuery(COMPACT_RESULTS_QUERY);
  const mediumResults = useMediaQuery(MEDIUM_RESULTS_QUERY);
  const isPhone = useIsPhone();
  const visibleColumns =
    storedColumns !== DEFAULT_VISIBLE_APPRAISAL_COLUMNS
      ? storedColumns
      : isPhone
        ? DEFAULT_VISIBLE_APPRAISAL_COLUMNS.filter((id) => PHONE_ON_BY_DEFAULT.includes(id))
        : compactResults
          ? DEFAULT_VISIBLE_APPRAISAL_COLUMNS.filter(
              (id) => !COMPACT_OFF_BY_DEFAULT.includes(id) && !MEDIUM_OFF_BY_DEFAULT.includes(id)
            )
          : mediumResults
            ? DEFAULT_VISIBLE_APPRAISAL_COLUMNS.filter((id) => !MEDIUM_OFF_BY_DEFAULT.includes(id))
            : storedColumns;
  const setVisibleColumns = useVisibleAppraisalColumns((state) => state.setValue);
  useHydratedStore(useVisibleAppraisalColumns);
  function toggleColumn(id: AppraisalColumnId) {
    const next = visibleColumns.includes(id)
      ? visibleColumns.filter((existing) => existing !== id)
      : [...visibleColumns, id];
    void setVisibleColumns(next);
  }

  const rows = useMemo(() => result?.appraisal.rows ?? [], [result]);
  const tableRows: OwnedRow[] = useMemo(() => {
    if (!owned) return rows;
    const withOwned: OwnedRow[] = subtractOwned(rows, owned);
    return [
      ...withOwned.filter((r) => (r.need ?? 0) > 0),
      ...withOwned.filter((r) => r.need === 0),
    ];
  }, [rows, owned]);
  const hasRefine = refineReady && pileFigures(rows, refineBasis).refinable;
  const hasLpOption = rows.some((row) => row.lpCorpName !== undefined);
  const hasTurnIn = turnIns?.any ?? false;
  function turnInSurfaceLine(row: OwnedRow, turnIn: RowTurnIn) {
    const against = turnIn.beats
      ? t('market.appraisal.turnIn.overSellNow', { amount: formatIskCompact(turnIn.over) })
      : turnIn.over <= 0
        ? t('market.appraisal.turnIn.sellNowPaysMore', { amount: formatIskCompact(-turnIn.over) })
        : t('market.appraisal.turnIn.refinePaysMore');
    if (turnIn.reward.quantity >= row.quantity) return against;
    return t('market.appraisal.turnIn.withCounted', {
      against,
      counted: formatVolume(turnIn.reward.quantity),
      asked: formatVolume(row.quantity),
    });
  }

  const columns: DataTableColumn<OwnedRow>[] = [
    {
      id: 'item',
      stickyStart: true,
      stickyStartOnPanel: true,
      header: t('market.appraisal.columnItem'),
      primary: true,
      render: (row) => (
        <>
          <MarketItemLink typeId={row.typeId}>{row.name}</MarketItemLink>
          <span className="block text-[0.6875rem] text-text-dim tabular-nums sm:hidden">
            {formatVolume(row.need ?? row.quantity)}
          </span>
        </>
      ),
      sortValue: (row) => row.name,
    },
    {
      id: 'quantity',
      header: owned ? t('market.appraisal.columnNeed') : t('market.appraisal.columnQuantity'),
      phoneHidden: true,
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) =>
        row.need !== undefined ? (
          <span>
            {formatVolume(row.need)}
            <span className="block text-[0.6875rem] text-text-dim">
              {t('market.appraisal.ownedBeneath', { qty: formatVolume(row.owned ?? 0) })}
            </span>
          </span>
        ) : (
          formatVolume(row.quantity)
        ),
      sortValue: (row) => row.need ?? row.quantity,
    },
  ];

  const accountingLevel = result?.accountingLevel ?? null;
  const brokerRelationsLevel = result?.brokerRelationsLevel ?? null;
  const feeInputs = useMemo(
    () =>
      accountingLevel === null || brokerRelationsLevel === null
        ? null
        : { accountingLevel, brokerRelationsLevel, standing },
    [accountingLevel, brokerRelationsLevel, standing]
  );
  const csvColumns = useMemo(
    () => appraisalCsvColumns(t, { fees: feeInputs, live: { refineBasis } }),
    [t, feeInputs, refineBasis]
  );
  const tableExport = useTableExport({
    surface: 'market-appraisal',
    rows: tableRows,
    columns: csvColumns,
  });
  const figures = (row: OwnedRow) => rowFigures(row, refineBasis, feeInputs);
  const asIsWins = (row: OwnedRow, side: RefineBasis) =>
    refineBasis === side && figures(row).refine.verdict === 'sellAsIs';

  const firstPriceColumn = APPRAISAL_COLUMN_IDS.find(
    (id) => PRICE_MARK_COLUMNS.has(id) && visibleColumns.includes(id)
  );
  const priceMark = (row: OwnedRow, id: AppraisalColumnId) => (
    <PriceMark state={row.priceState} silent={id !== firstPriceColumn} />
  );

  const optionalColumnsById: Record<AppraisalColumnId, DataTableColumn<OwnedRow>> = {
    buyEach: {
      id: 'buyEach',
      header: t('market.appraisal.columnBuyEach'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => (
        <>
          {priceMark(row, 'buyEach')}
          {eachCell(row.buyEach)}
        </>
      ),
      sortValue: (row) => row.buyEach ?? undefined,
    },
    sellEach: {
      id: 'sellEach',
      header: t('market.appraisal.columnSellEach'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => (
        <>
          {priceMark(row, 'sellEach')}
          {eachCell(row.sellEach)}
        </>
      ),
      sortValue: (row) => row.sellEach ?? undefined,
    },
    splitEach: {
      id: 'splitEach',
      header: t('market.appraisal.columnSplitEach'),
      headerTooltip: t('market.appraisal.columnSplitEachHelp'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => eachCell(figures(row).splitEach),
      sortValue: (row) => figures(row).splitEach ?? undefined,
    },
    buyTotal: {
      id: 'buyTotal',
      header: t('market.appraisal.columnBuyTotal'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) =>
        comparisonCell(
          totalCell(row.buyTotal),
          asIsWins(row, 'buy'),
          undefined,
          <>
            {row.buyWalk && (
              <HintText
                content={t(
                  row.buyWalk.unsold > 0
                    ? 'market.appraisal.buyWalkUnsoldHint'
                    : 'market.appraisal.buyWalkHint',
                  {
                    avg: formatIskAuto(row.buyEach ?? 0),
                    topBid: formatIskAuto(row.buyWalk.topBid),
                    takes: formatVolume(row.buyWalk.topBidTakes),
                    units: formatVolume(row.quantity),
                    unsold: formatVolume(row.buyWalk.unsold),
                  }
                )}
                className="mr-1 text-warning"
              >
                !
              </HintText>
            )}
            {priceMark(row, 'buyTotal')}
          </>
        ),
      sortValue: (row) => row.buyTotal ?? undefined,
    },
    sellTotal: {
      id: 'sellTotal',
      header: t('market.appraisal.columnSellTotal'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => (
        <>
          {priceMark(row, 'sellTotal')}
          {comparisonCell(totalCell(row.sellTotal), asIsWins(row, 'sell'))}
        </>
      ),
      sortValue: (row) => row.sellTotal ?? undefined,
    },
    refineTotal: {
      id: 'refineTotal',
      header: t('market.appraisal.columnRefineTotal'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => {
        const { minerals, verdict, pricedAll } = figures(row).refine;
        if (minerals === undefined) return '—';
        return comparisonCell(
          onOpenRefine ? (
            <RefineFigureButton name={row.name} onOpen={() => onOpenRefine(row.typeId)}>
              {totalCell(minerals)}
            </RefineFigureButton>
          ) : (
            totalCell(minerals)
          ),
          verdict === 'refine',
          pricedAll === false && (
            <HintText
              content={t('market.appraisal.refinePartialHint')}
              className="ml-0.5 text-warning"
            >
              *
            </HintText>
          )
        );
      },
      sortValue: (row) => figures(row).refine.minerals,
    },
    refineWithLeftover: {
      id: 'refineWithLeftover',
      header: t('market.appraisal.columnRefineWithLeftover'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => {
        const { withLeftover, verdict, pricedAll } = figures(row).refine;
        if (withLeftover === undefined) return '—';
        return comparisonCell(
          totalCell(withLeftover),
          verdict === 'refine',
          pricedAll === false && (
            <HintText
              content={t('market.appraisal.refinePartialHint')}
              className="ml-0.5 text-warning"
            >
              *
            </HintText>
          )
        );
      },
      sortValue: (row) => figures(row).refine.withLeftover,
    },
    turnIn: {
      id: 'turnIn',
      header: t('market.appraisal.columnTurnIn'),
      headerTooltip: t('market.appraisal.columnTurnInHelp'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => {
        const turnIn = turnIns?.rowTurnIn(row) ?? null;
        if (turnIn === null) return '—';
        return comparisonCell(
          <TurnInDetail
            name={row.name}
            offer={turnIn.offer}
            surfaceLine={turnInSurfaceLine(row, turnIn)}
            trigger={
              <TurnInFigureButton name={row.name}>
                {approxIsk(turnIn.reward.total)}
              </TurnInFigureButton>
            }
          />,
          turnIn.beats
        );
      },
      sortValue: (row) => turnIns?.rowTurnIn(row)?.reward.total,
    },
    lpTotal: {
      id: 'lpTotal',
      header: t('market.appraisal.columnLpTotal'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => {
        if (row.lpCorpName === undefined || row.lpCorporationId === undefined) return '—';
        const label = t('market.appraisal.lpTotalCell', {
          isk: formatIskAuto(row.lpIskCost ?? 0),
          lp: formatVolume(row.lpCost ?? 0),
          corp: row.lpCorpName,
        });
        return comparisonCell(
          <span className="inline-flex items-center gap-1">
            {totalCell(row.lpIskCost ?? null)}
            <LpStoreLink
              corporationId={row.lpCorporationId}
              offerId={row.lpOfferId}
              label={label}
            />
          </span>,
          lpBeatsMarket(row),
          row.lpAffordable === false && (
            <HintText
              content={t('market.appraisal.lpUnaffordableHint', { corp: row.lpCorpName })}
              className="ml-0.5 text-warning"
            >
              *
            </HintText>
          )
        );
      },
      sortValue: (row) => row.lpIskCost ?? undefined,
    },
    volume: appraisalVolumeColumn(t),
    iskPerM3: appraisalIskPerM3Column(t),
    salesTax: {
      id: 'salesTax',
      header: t('market.appraisal.columnSalesTax'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => totalCell(figures(row).fees.salesTax),
      sortValue: (row) => figures(row).fees.salesTax ?? undefined,
    },
    brokerFee: {
      id: 'brokerFee',
      header: t('market.appraisal.columnBrokerFee'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => totalCell(figures(row).fees.brokerFee),
      sortValue: (row) => figures(row).fees.brokerFee ?? undefined,
    },
    sellAfterFees: {
      id: 'sellAfterFees',
      header: t('market.appraisal.columnSellAfterFees'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => totalCell(figures(row).fees.afterFees),
      sortValue: (row) => figures(row).fees.afterFees ?? undefined,
    },
  };
  const availableColumns = APPRAISAL_COLUMN_IDS.filter(
    (id) =>
      ((id !== 'refineTotal' && id !== 'refineWithLeftover') || hasRefine) &&
      (id !== 'turnIn' || hasTurnIn) &&
      (id !== 'lpTotal' || hasLpOption) &&
      (feeInputs !== null || (id !== 'salesTax' && id !== 'brokerFee' && id !== 'sellAfterFees'))
  );
  for (const id of availableColumns) {
    if (visibleColumns.includes(id)) columns.push(optionalColumnsById[id]);
  }

  const canRemoveRows = !looksLikeEftFit(text);
  function removeRow(name: string) {
    const next = removeItemFromPaste(text, name);
    if (next === null) return;
    if (next.trim() === '') controller.clear();
    else controller.appraiseText(next);
  }
  function removeItem(row: OwnedRow) {
    if (!canRemoveRows) return undefined;
    return (
      <>
        <MenuSeparator />
        <MenuItem className="text-danger" onSelect={() => removeRow(row.name)}>
          {t('market.appraisal.removeRow')}
        </MenuItem>
      </>
    );
  }

  function rowContextMenu(row: OwnedRow, tr: ReactElement) {
    return (
      <ItemContextMenu typeId={row.typeId} itemName={row.name} extraItems={removeItem(row)}>
        {tr}
      </ItemContextMenu>
    );
  }

  return {
    columns,
    rows,
    tableRows,
    tableExport,
    visibleColumns,
    availableColumns,
    optionalColumnsById,
    toggleColumn,
    rowContextMenu,
    hasRefine,
    hasLpOption,
  };
}
