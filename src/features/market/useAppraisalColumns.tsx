import { useMemo, type ReactElement } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useTranslation } from 'react-i18next';
import { MenuItem, MenuSeparator, type DataTableColumn } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { useTableExport } from '@/components/ui/useTableExport';
import {
  lpBeatsMarket,
  refineBeatsSellAsIs,
  refinePricedAllFor,
  refineTotalFor,
  sellAsIsBeatsRefine,
  type RefineBasis,
  sellAfterFees,
  sellBrokerFee,
  sellSalesTax,
  splitEach,
} from '@/engine/market/appraisal';
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
import { appraisalCsvColumns } from './appraisalCsv';
import { appraisalIskPerM3Column, appraisalVolumeColumn } from './appraisalVolume';
import { formatVolume } from './format';
import { ItemContextMenu } from './ItemContextMenu';
import { PriceMark } from './LivePriceStatus';
import { MarketItemLink } from './MarketItemLink';
import type { AppraisalController } from './useAppraisal';

/** `lg` up to (not including) `xl`: paste card and results share a row but the results card is narrow. A min-and-max pair never matches under the test `matchMedia` stub, so tests see the full default. */
const COMPACT_RESULTS_QUERY = '(min-width: 64rem) and (max-width: 79.999rem)';
const COMPACT_OFF_BY_DEFAULT: readonly AppraisalColumnId[] = ['buyEach', 'sellEach', 'volume'];
/** A phone starts with Item, Buy and Sell; the Columns menu swaps others in. */
/** The columns whose cells wear the live-price mark. */
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
  refineBasis = 'buy',
  refineReady = true,
}: {
  controller: AppraisalController;
  owned: ReadonlyMap<number, number> | null;
  /** The active Character's standing toward this hub's NPC station owner, for the broker fee. */
  standing: ResolvedStandings;
  /** Opens the refine breakdown on one item; absent, the Refine figure is plain text. */
  onOpenRefine?: (typeId: number) => void;
  /** The side of the book the Refine total column is priced on (the remembered pick). */
  refineBasis?: RefineBasis;
  /** False until the remembered basis has loaded, so the Refine figures do not show on buy first and then switch. */
  refineReady?: boolean;
}) {
  const { t } = useTranslation();
  const { text, result } = controller;
  const storedColumns = useVisibleAppraisalColumns((state) => state.value);
  // Side by side below `xl` the results card is only ~500px wide, so with no
  // stored selection the per-unit price and volume columns start unticked (the totals and the Cargo group say
  // the same thing) rather than pushing the row menu out of reach. Only a
  // default: ticking one shows it, and a stored selection is read as saved.
  const compactResults = useMediaQuery(COMPACT_RESULTS_QUERY);
  const isPhone = useIsPhone();
  const visibleColumns =
    storedColumns !== DEFAULT_VISIBLE_APPRAISAL_COLUMNS
      ? storedColumns
      : isPhone
        ? DEFAULT_VISIBLE_APPRAISAL_COLUMNS.filter((id) => PHONE_ON_BY_DEFAULT.includes(id))
        : compactResults
          ? DEFAULT_VISIBLE_APPRAISAL_COLUMNS.filter((id) => !COMPACT_OFF_BY_DEFAULT.includes(id))
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
  // Fully covered lines sink to the bottom (stable otherwise) and render dim.
  const tableRows: OwnedRow[] = useMemo(() => {
    if (!owned) return rows;
    const withOwned: OwnedRow[] = subtractOwned(rows, owned);
    return [
      ...withOwned.filter((r) => (r.need ?? 0) > 0),
      ...withOwned.filter((r) => r.need === 0),
    ];
  }, [rows, owned]);
  const hasRefine =
    refineReady && rows.some((row) => refineTotalFor(row, refineBasis) !== undefined);
  // Undefined per row when nothing the active Character holds LP with sells
  // this item — same "only earns its place once something has it" rule as
  // the refine column, and also why this never shows with no active
  // Character (`appraisalData.ts` never sets `lpOption` then).
  const hasLpOption = rows.some((row) => row.lpCorpName !== undefined);

  const columns: DataTableColumn<OwnedRow>[] = [
    {
      id: 'item',
      stickyStart: true,
      stickyStartOnPanel: true,
      header: t('market.appraisal.columnItem'),
      primary: true,
      // A priced line is nearly always followed by "…and what is the book
      // actually like?", so the name is the way through to the Browser. The
      // link drops `section`, which is exactly what `Market.tsx` reads as an
      // incoming item link and answers by switching tabs; the paste itself
      // survives the trip because `useAppraisal` lives at route level.
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
      // On a phone the count sits under the item name instead (below).
      phoneHidden: true,
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      // A count, not ISK — an ISK formatter would run `clampIskZero` over it.
      render: (row) =>
        row.need !== undefined ? (
          <span>
            {formatVolume(row.need)}
            <span className="block text-[0.625rem] text-text-dim">
              {t('market.appraisal.ownedBeneath', { qty: formatVolume(row.owned ?? 0) })}
            </span>
          </span>
        ) : (
          formatVolume(row.quantity)
        ),
      sortValue: (row) => row.need ?? row.quantity,
    },
  ];

  // Sales tax is the Accounting skill's rate and the broker fee is Broker
  // Relations plus standing, so with no Character (or skills still loading)
  // there is no honest figure and the fee columns stay out of the table and
  // the picker, as Refine does without refine data.
  const accountingLevel = result?.accountingLevel ?? null;
  const brokerRelationsLevel = result?.brokerRelationsLevel ?? null;
  const feeInputs = useMemo(
    () =>
      accountingLevel === null || brokerRelationsLevel === null
        ? null
        : { accountingLevel, brokerRelationsLevel, standing },
    [accountingLevel, brokerRelationsLevel, standing]
  );
  // Every column, whichever the picker shows; fees blank until the skills load.
  const csvColumns = useMemo(
    () => appraisalCsvColumns(t, { fees: feeInputs, live: true }),
    [t, feeInputs]
  );
  // The rows as the table holds them (need/owned, covered lines last), in the table's sort.
  const tableExport = useTableExport({
    surface: 'market-appraisal',
    rows: tableRows,
    columns: csvColumns,
  });
  const taxFor = (row: OwnedRow) =>
    accountingLevel === null ? null : sellSalesTax(row, accountingLevel);
  const brokerFor = (row: OwnedRow) =>
    feeInputs === null ? null : sellBrokerFee(row, feeInputs.brokerRelationsLevel, standing);
  const afterFeesFor = (row: OwnedRow) =>
    feeInputs === null ? null : sellAfterFees(row, feeInputs);

  // The optional columns' catalog, keyed by `AppraisalColumnId` so the
  // `ColumnPickerMenu` below and the push loop past it share one definition.
  // Refine and LP store still only ever enter `availableColumns` when the
  // data backing them exists — a picker toggle for a column with nothing to
  // show would just be a lie.
  // The price mark repeats in up to four cells of a row; only the first shown
  // one speaks, the rest keep the icon and tooltip.
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
      render: (row) => eachCell(splitEach(row)),
      sortValue: (row) => splitEach(row) ?? undefined,
    },
    buyTotal: {
      id: 'buyTotal',
      header: t('market.appraisal.columnBuyTotal'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) =>
        comparisonCell(
          totalCell(row.buyTotal),
          refineBasis === 'buy' && sellAsIsBeatsRefine(row, 'buy'),
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
          {comparisonCell(
            totalCell(row.sellTotal),
            refineBasis === 'sell' && sellAsIsBeatsRefine(row, 'sell')
          )}
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
        const refine = refineTotalFor(row, refineBasis);
        if (refine === undefined) return '—';
        return comparisonCell(
          onOpenRefine ? (
            <RefineFigureButton name={row.name} onOpen={() => onOpenRefine(row.typeId)}>
              {totalCell(refine)}
            </RefineFigureButton>
          ) : (
            totalCell(refine)
          ),
          refineBeatsSellAsIs(row, refineBasis),
          refinePricedAllFor(row, refineBasis) === false && (
            <HintText
              content={t('market.appraisal.refinePartialHint')}
              className="ml-0.5 text-warning"
            >
              *
            </HintText>
          )
        );
      },
      sortValue: (row) => refineTotalFor(row, refineBasis),
    },
    lpTotal: {
      id: 'lpTotal',
      header: t('market.appraisal.columnLpTotal'),
      align: 'right',
      // Kept to the width of an ISK figure plus one icon — never the full
      // "X ISK + Y LP (Corp)" sentence, which would blow out the column at
      // phone width. That sentence still exists, as the icon's tooltip and
      // accessible name (`LpStoreLink`'s `label`).
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
      render: (row) => totalCell(taxFor(row)),
      sortValue: (row) => taxFor(row) ?? undefined,
    },
    brokerFee: {
      id: 'brokerFee',
      header: t('market.appraisal.columnBrokerFee'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => totalCell(brokerFor(row)),
      sortValue: (row) => brokerFor(row) ?? undefined,
    },
    sellAfterFees: {
      id: 'sellAfterFees',
      header: t('market.appraisal.columnSellAfterFees'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => totalCell(afterFeesFor(row)),
      sortValue: (row) => afterFeesFor(row) ?? undefined,
    },
  };
  const availableColumns = APPRAISAL_COLUMN_IDS.filter(
    (id) =>
      (id !== 'refineTotal' || hasRefine) &&
      (id !== 'lpTotal' || hasLpOption) &&
      (feeInputs !== null || (id !== 'salesTax' && id !== 'brokerFee' && id !== 'sellAfterFees'))
  );
  for (const id of availableColumns) {
    if (visibleColumns.includes(id)) columns.push(optionalColumnsById[id]);
  }

  // The same menu the tree, the Quickbar and the Variations table carry — an
  // appraised row is an item like any other, and every action on it applies.
  // The Item Detail modal (Market's `ItemActionsProvider`) and `CompareDrawer`
  // sit outside Market's section guards, so Show Info and Add to Compare work
  // from this tab without a second copy of either.
  // Takes the item's lines out of the text box and prices what is left. Gone
  // is gone, with no confirmation: pasting the list again brings it back. A
  // fit has no such thing as one item's lines, so it carries no Remove.
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
