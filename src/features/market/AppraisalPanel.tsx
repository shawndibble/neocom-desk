/**
 * The Market page's Appraisal tab: paste a pile of items, read what it is
 * worth on both sides of a Trade Hub's order book.
 *
 * The paste box stays beside the ledger rather than collapsing once a result
 * exists — an appraisal is usually edited two or three times (a line typo, a
 * stack left out), and a list you can still see is a list you can still fix.
 * That is also where unmatched lines are reported, next to the text they
 * refer to.
 *
 * The Browser's own two-column grid holds two halves: the paste box, one
 * `Panel`, narrower on the left since it does not need the width the Market
 * Group tree does; and the result column, which stacks the primary result
 * `Panel` above an optional, foldable Compare Hubs section once something
 * has been appraised.
 */
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ColumnPickerMenu,
  DataTable,
  EmptyState,
  IconButton,
  IskAmount,
  Panel,
  Spinner,
  StatChip,
  TextInput,
  type DataTableColumn,
  type IskRevealGesture,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { Caret } from '@/components/ui/Disclosure';
import { fieldBaseClassName } from '@/components/ui/controlStyles';
import { AssumesBaseStandingsNote } from '@/features/character/AssumesBaseStandingsNote';
import { ImplantsAssumedNote } from '@/features/character/ImplantsAssumedNote';
import {
  appraisalNet,
  lpBeatsMarket,
  refineBeatsSellAsIs,
  type AppraisalRow,
} from '@/engine/market/appraisal';
import { countPasteLines } from '@/engine/market/appraisalPaste';
import type { ResolvedStandings } from '@/engine/market/standings';
import { iskToneClass } from '@/features/character/format';
import type { BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { LpStoreLink } from '@/features/loyalty/LpStoreLink';
import { writeToClipboard } from '@/lib/clipboard';
import { formatIskAuto } from '@/lib/isk';
import { downloadCsv } from '@/lib/downloadCsv';
import type { TradeHub } from '@/market/hubs';
import {
  APPRAISAL_COLUMN_IDS,
  useVisibleAppraisalColumns,
  type AppraisalColumnId,
} from './appraisalColumns';
import { appraisalCsvColumns } from './appraisalCsv';
import { appraisalSellListText, hasAppraisalSellList } from './appraisalSellListText';
import { buildAppraisalShareLink, MAX_SHARE_ITEMS } from './appraisalShareData';
import { formatVolume } from './format';
import { HubCompareCards } from './HubCompareCards';
import { ItemContextMenu } from './ItemContextMenu';
import { MarketItemLink } from './MarketItemLink';
import { isValidPricePercent, MAX_PRICE_PERCENT, MIN_PRICE_PERCENT } from './pricePercent';
import type { AppraisalController } from './useAppraisal';

interface AppraisalPanelProps {
  controller: AppraisalController;
  pricePercent: number;
  onPricePercentChange: (value: number) => void;
  /** The hub the figures are quoted at — the panel's own provenance chip, and what a Share link (#831) is generated against. */
  hub: TradeHub;
  /** The active Character's standing toward this hub's NPC station owner, for the net-of-fees chips' broker fee. */
  standing: ResolvedStandings;
  /** Same per-item context menu as the tree and the Variations table: null until requested, then per-typeId lookups. */
  blueprintCatalog: BlueprintCatalog | null;
  onRequestBlueprintCatalog: () => void;
  onAddToQuickbar: (typeId: number, itemName: string) => void;
  quickbarAvailable: boolean;
  onShowInfo: (typeId: number, itemName: string) => void;
  /** Opens the Compare Hubs panel already expanded — the Quickbar's "View in Appraisal" action (#726) lands directly on the multi-hub view rather than a collapsed one. */
  defaultCompareExpanded?: boolean;
}

/**
 * A per-unit price, exact. A missing price is a dash, never a zero — the house
 * placeholder. Stays on `formatIskAuto` rather than shorthand: an each-price
 * runs from a 5 ISK mineral to a billion-ISK hull, and compact notation rounds
 * the cheap end (4.99 and 5.01 both render "5") into nonsense.
 */
function eachCell(value: number | null): string {
  if (value === null) return '—';
  return formatIskAuto(value);
}

/** A line or hub total as scannable shorthand, exact value one gesture away. */
function totalCell(value: number | null, revealOn: IskRevealGesture): ReactNode {
  if (value === null) return '—';
  return <IskAmount value={value} revealOn={revealOn} decimals={0} />;
}

/** Bolds a total only when it actually won a real comparison — never on a row with nothing to compare against. */
function comparisonCell(total: ReactNode, highlighted: boolean, suffix?: ReactElement | false) {
  return (
    <span className={highlighted ? 'font-semibold text-accent' : undefined}>
      {total}
      {suffix}
    </span>
  );
}

export function AppraisalPanel({
  controller,
  pricePercent,
  onPricePercentChange,
  hub,
  standing,
  blueprintCatalog,
  onRequestBlueprintCatalog,
  onAddToQuickbar,
  quickbarAvailable,
  onShowInfo,
  defaultCompareExpanded = false,
}: AppraisalPanelProps) {
  const { t } = useTranslation();
  const { text, setText, result, compare, loading, failed } = controller;
  const [compareExpanded, setCompareExpanded] = useState(defaultCompareExpanded);
  const [shareCopied, setShareCopied] = useState(false);
  const [sellListCopied, setSellListCopied] = useState(false);
  const hubName = hub.systemName;

  const visibleColumns = useVisibleAppraisalColumns((state) => state.value);
  const setVisibleColumns = useVisibleAppraisalColumns((state) => state.setValue);
  const hydrateVisibleColumns = useVisibleAppraisalColumns((state) => state.hydrate);
  useEffect(() => {
    void hydrateVisibleColumns();
  }, [hydrateVisibleColumns]);
  function toggleColumn(id: AppraisalColumnId) {
    const next = visibleColumns.includes(id)
      ? visibleColumns.filter((existing) => existing !== id)
      : [...visibleColumns, id];
    void setVisibleColumns(next);
  }

  async function handleShare() {
    if (!result) return;
    setShareCopied(false);
    const shared = buildAppraisalShareLink(result, hub, pricePercent);
    if (!shared.ok) return; // pre-checked by the disabled state below
    try {
      await writeToClipboard(shared.url);
      setShareCopied(true);
    } catch {
      setShareCopied(false);
    }
  }

  const sellListItems = result?.appraisal.items ?? [];
  const canCopySellList = hasAppraisalSellList(sellListItems);

  async function handleCopySellList() {
    if (!canCopySellList) return;
    setSellListCopied(false);
    try {
      await writeToClipboard(appraisalSellListText(sellListItems));
      setSellListCopied(true);
    } catch {
      setSellListCopied(false);
    }
  }

  /*
   * The percent field is a string while it is being typed. Committing on every
   * keystroke would fight the typist: clearing the box to retype "90" sends an
   * empty string, and a field that snaps back to 100 the moment you delete a
   * digit cannot be edited at all. So the box holds whatever is typed, and the
   * setting is only written when what is typed is a number in range.
   */
  const [percentText, setPercentText] = useState(String(pricePercent));
  const [lastPercent, setLastPercent] = useState(pricePercent);
  if (pricePercent !== lastPercent) {
    // Adjusted during render rather than in an effect — the same idiom
    // `Market.tsx` uses to reset its order book when the selection changes,
    // and for the same reason: an effect would paint the stale value first.
    // A value the pilot is mid-way through typing does not land here, because
    // that path only writes `pricePercent` once what is typed has parsed.
    setLastPercent(pricePercent);
    if (Number(percentText) !== pricePercent) setPercentText(String(pricePercent));
  }

  function handlePercentChange(next: string) {
    setPercentText(next);
    const parsed = Number(next);
    if (next.trim() !== '' && isValidPricePercent(parsed)) onPricePercentChange(parsed);
  }

  const columns: DataTableColumn<AppraisalRow>[] = [
    {
      id: 'quantity',
      header: t('market.appraisal.columnQuantity'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      // A count, not ISK — an ISK formatter would run `clampIskZero` over it.
      render: (row) => formatVolume(row.quantity),
      sortValue: (row) => row.quantity,
    },
    {
      id: 'item',
      header: t('market.appraisal.columnItem'),
      primary: true,
      // A priced line is nearly always followed by "…and what is the book
      // actually like?", so the name is the way through to the Browser. The
      // link drops `section`, which is exactly what `Market.tsx` reads as an
      // incoming item link and answers by switching tabs; the paste itself
      // survives the trip because `useAppraisal` lives at route level.
      render: (row) => <MarketItemLink typeId={row.typeId}>{row.name}</MarketItemLink>,
      sortValue: (row) => row.name,
    },
  ];

  const rows = result?.appraisal.rows ?? [];
  const totals = result?.appraisal.totals;
  const unmatched = result?.unmatched ?? [];
  const implantBonusPct = result?.implantBonusPct ?? 0;
  const refinesOreOrIce = result?.refinesOreOrIce ?? false;
  const accountingLevel = result?.accountingLevel ?? null;
  const brokerRelationsLevel = result?.brokerRelationsLevel ?? null;
  // Null while skills are loading, or with no active Character — falls back
  // to the result panel's own loading/empty states rather than ever showing
  // a base-rate (untrained) figure.
  const net = useMemo(() => {
    if (result === null || accountingLevel === null || brokerRelationsLevel === null) return null;
    return appraisalNet(result.appraisal.items, {
      accountingLevel,
      brokerRelationsLevel,
      standing,
    });
  }, [result, accountingLevel, brokerRelationsLevel, standing]);
  // Undefined per row when the type has no reprocessing data at all — the
  // column only earns its place on screen when at least one row has
  // something to show, which is also exactly when there is nothing to show
  // with no active Character (`appraisalData.ts` never sets `refine` then).
  const hasRefine = rows.some((row) => row.refineTotal !== undefined);
  // Undefined per row when nothing the active Character holds LP with sells
  // this item — same "only earns its place once something has it" rule as
  // the refine column, and also why this never shows with no active
  // Character (`appraisalData.ts` never sets `lpOption` then).
  const hasLpOption = rows.some((row) => row.lpCorpName !== undefined);

  // The optional columns' catalog, keyed by `AppraisalColumnId` so the
  // `ColumnPickerMenu` below and the push loop past it share one definition.
  // Refine and LP store still only ever enter `availableColumns` when the
  // data backing them exists — a picker toggle for a column with nothing to
  // show would just be a lie.
  const optionalColumnsById: Record<AppraisalColumnId, DataTableColumn<AppraisalRow>> = {
    buyEach: {
      id: 'buyEach',
      header: t('market.appraisal.columnBuyEach'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => eachCell(row.buyEach),
      sortValue: (row) => row.buyEach ?? undefined,
    },
    sellEach: {
      id: 'sellEach',
      header: t('market.appraisal.columnSellEach'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => eachCell(row.sellEach),
      sortValue: (row) => row.sellEach ?? undefined,
    },
    buyTotal: {
      id: 'buyTotal',
      header: t('market.appraisal.columnBuyTotal'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) =>
        comparisonCell(
          totalCell(row.buyTotal, 'longPress'),
          row.refineTotal !== undefined && !refineBeatsSellAsIs(row)
        ),
      sortValue: (row) => row.buyTotal ?? undefined,
    },
    sellTotal: {
      id: 'sellTotal',
      header: t('market.appraisal.columnSellTotal'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => totalCell(row.sellTotal, 'longPress'),
      sortValue: (row) => row.sellTotal ?? undefined,
    },
    refineTotal: {
      id: 'refineTotal',
      header: t('market.appraisal.columnRefineTotal'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) =>
        row.refineTotal === undefined
          ? '—'
          : comparisonCell(
              totalCell(row.refineTotal, 'longPress'),
              refineBeatsSellAsIs(row),
              row.refinePricedAll === false && (
                <span
                  className="ml-0.5 text-warning"
                  title={t('market.appraisal.refinePartialHint')}
                >
                  *
                </span>
              )
            ),
      sortValue: (row) => row.refineTotal ?? undefined,
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
            {totalCell(row.lpIskCost ?? null, 'longPress')}
            <LpStoreLink corporationId={row.lpCorporationId} label={label} />
          </span>,
          lpBeatsMarket(row),
          row.lpAffordable === false && (
            <span
              className="ml-0.5 text-warning"
              title={t('market.appraisal.lpUnaffordableHint', { corp: row.lpCorpName })}
            >
              *
            </span>
          )
        );
      },
      sortValue: (row) => row.lpIskCost ?? undefined,
    },
  };
  const availableColumns = APPRAISAL_COLUMN_IDS.filter(
    (id) => (id !== 'refineTotal' || hasRefine) && (id !== 'lpTotal' || hasLpOption)
  );
  for (const id of availableColumns) {
    if (visibleColumns.includes(id)) columns.push(optionalColumnsById[id]);
  }

  // The same menu the tree, the Quickbar and the Variations table carry — an
  // appraised row is an item like any other, and every action on it applies.
  // `ItemDetailModal` and `CompareDrawer` are rendered by `Market.tsx` outside
  // its section guards, so Show Info and Add to Compare work from this tab
  // without a second copy of either.
  function rowContextMenu(row: AppraisalRow, tr: ReactElement) {
    const blueprintTypeID =
      blueprintCatalog === null
        ? undefined
        : (blueprintCatalog.byProductTypeID.get(row.typeId)?.blueprintTypeID ?? null);
    return (
      <ItemContextMenu
        typeId={row.typeId}
        itemName={row.name}
        blueprintTypeID={blueprintTypeID}
        onAddToQuickbar={onAddToQuickbar}
        quickbarAvailable={quickbarAvailable}
        onShowInfo={onShowInfo}
        onOpenChange={(open) => {
          if (open) onRequestBlueprintCatalog();
        }}
      >
        {tr}
      </ItemContextMenu>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[21rem_1fr] lg:items-start">
      <Panel
        title={t('market.appraisal.pasteTitle')}
        meta={
          controller.canAppraise ? (
            <StatChip
              label={t('market.appraisal.linesLabel')}
              // The box's own line count, which is deliberately not the
              // table's row count: repeated names merge into one priced row,
              // so "15 lines" and "14 items" can both be true. Split by the
              // parser's own rule rather than a second regex here, so the two
              // can never disagree about what a line is.
              value={formatVolume(countPasteLines(text))}
            />
          ) : undefined
        }
      >
        <div className="flex flex-col gap-2">
          <label className="block text-xs text-text-dim" htmlFor="market-appraisal-text">
            {t('market.appraisal.pasteLabel')}
          </label>
          <textarea
            id="market-appraisal-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={14}
            spellCheck={false}
            placeholder={t('market.appraisal.pastePlaceholder')}
            className={`${fieldBaseClassName} w-full p-2 font-mono text-[0.6875rem]`}
          />

          <div className="flex items-center gap-2">
            <label
              className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase"
              htmlFor="market-appraisal-percent"
            >
              {t('market.appraisal.pricePercentLabel')}
            </label>
            <TextInput
              id="market-appraisal-percent"
              size="sm"
              type="number"
              inputMode="decimal"
              min={MIN_PRICE_PERCENT}
              max={MAX_PRICE_PERCENT}
              value={percentText}
              onChange={(event) => handlePercentChange(event.target.value)}
              className="field-no-spinner w-16 text-right"
            />
            <span className="text-xs text-text-dim">{t('market.appraisal.pricePercentHint')}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={controller.appraise}
              disabled={!controller.canAppraise || loading}
            >
              {t('market.appraisal.appraise')}
            </Button>
            <Button size="sm" onClick={controller.clear} disabled={text === ''}>
              {t('market.appraisal.clear')}
            </Button>
          </div>

          {unmatched.length > 0 && (
            <div className="rounded-xs border border-line bg-panel-2 px-2.5 py-2">
              <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-widest text-warning uppercase">
                <Icon.Warn aria-hidden="true" size={Icon.ICON_SIZE.sm} />
                {t('market.appraisal.unmatched', { count: unmatched.length })}
              </p>
              <ul className="pt-1">
                {unmatched.map((entry) => (
                  <li key={entry.name} className="font-mono text-[0.6875rem] text-text-dim">
                    {t('market.appraisal.unmatchedLine', {
                      lines: entry.lines.join(', '),
                      name: entry.name,
                    })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Panel>

      <div className="flex flex-col gap-4">
        <Panel
          title={t('market.appraisal.resultTitle')}
          padded={result === null}
          meta={
            result !== null ? (
              <StatChip label={hubName} value={t('market.appraisal.atPercent', { pricePercent })} />
            ) : undefined
          }
          actions={
            <>
              <ColumnPickerMenu
                available={availableColumns}
                visible={visibleColumns}
                columnsById={optionalColumnsById}
                onToggle={toggleColumn}
                buttonLabel={t('market.appraisal.columnsButton')}
                menuTitle={t('market.appraisal.columnsMenuTitle')}
              />
              <IconButton
                size="sm"
                icon={shareCopied ? <Icon.Done /> : <Icon.Share />}
                label={t('market.appraisal.share')}
                tooltip={
                  rows.length > MAX_SHARE_ITEMS
                    ? t('market.appraisal.shareTooLarge')
                    : shareCopied
                      ? t('market.appraisal.shareCopied')
                      : undefined
                }
                disabled={rows.length === 0 || rows.length > MAX_SHARE_ITEMS}
                onClick={() => void handleShare()}
              />
              <IconButton
                size="sm"
                icon={sellListCopied ? <Icon.Done /> : <Icon.CopyToClipboard />}
                label={t('market.appraisal.copySellList')}
                tooltip={
                  sellListCopied
                    ? t('market.appraisal.sellListCopied')
                    : t('market.appraisal.sellListHelp', { hub: hubName })
                }
                disabled={!canCopySellList}
                onClick={() => void handleCopySellList()}
              />
              <IconButton
                size="sm"
                icon={<Icon.Download />}
                label={t('market.appraisal.exportCsv')}
                disabled={rows.length === 0}
                onClick={() =>
                  downloadCsv('market-appraisal', rows, appraisalCsvColumns(t), new Date())
                }
              />
            </>
          }
        >
          {loading && result === null ? (
            <div className="flex justify-center py-8">
              <Spinner label={t('common.loading')} />
            </div>
          ) : failed ? (
            <EmptyState
              title={t('market.loadFailedTitle')}
              hint={t('market.loadFailedHint')}
              className="py-8"
            />
          ) : result === null || totals === undefined ? (
            <EmptyState
              title={t('market.appraisal.emptyTitle')}
              hint={t('market.appraisal.emptyHint')}
              className="py-8"
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title={t('market.appraisal.noMatchesTitle')}
              hint={t('market.appraisal.noMatchesHint')}
              className="py-8"
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                <StatChip
                  label={t('market.appraisal.sellTotal')}
                  value={<IskAmount value={totals.sell} revealOn="tap" decimals={0} />}
                  tone="accent"
                  tooltip={t('market.appraisal.sellTotalHelp')}
                />
                <StatChip
                  label={t('market.appraisal.buyTotal')}
                  value={<IskAmount value={totals.buy} revealOn="tap" decimals={0} />}
                  tooltip={t('market.appraisal.buyTotalHelp')}
                />
                {net && (
                  <StatChip
                    label={t('market.appraisal.instantNet')}
                    value={
                      <span className={iskToneClass(net.instantNet)}>
                        <IskAmount value={net.instantNet} revealOn="tap" decimals={0} />
                      </span>
                    }
                    tooltip={t('market.appraisal.instantNetHelp', {
                      tax: net.salesTaxPct.toFixed(2),
                    })}
                  />
                )}
                {net && (
                  <StatChip
                    label={t('market.appraisal.listNet')}
                    value={
                      <span className={iskToneClass(net.listNet)}>
                        <IskAmount value={net.listNet} revealOn="tap" decimals={0} />
                      </span>
                    }
                    tooltip={t('market.appraisal.listNetHelp', {
                      tax: net.salesTaxPct.toFixed(2),
                      broker: net.brokerFeePct.toFixed(2),
                    })}
                  />
                )}
                <StatChip
                  label={t('market.appraisal.spread')}
                  value={
                    <span className={iskToneClass(totals.spread)}>
                      <IskAmount value={totals.spread} revealOn="tap" decimals={0} />
                    </span>
                  }
                />
                {hasRefine && (
                  <StatChip
                    label={t('market.appraisal.refineTotal')}
                    value={<IskAmount value={totals.refine} revealOn="tap" decimals={0} />}
                    tooltip={
                      implantBonusPct > 0
                        ? `${t('market.appraisal.refineTotalHelp')} ${t('market.appraisal.refineImplantHint', { pct: implantBonusPct })}`
                        : t('market.appraisal.refineTotalHelp')
                    }
                  />
                )}
                {hasLpOption && (
                  <StatChip
                    label={t('market.appraisal.cheapestBuy')}
                    value={<IskAmount value={totals.cheapestBuy} revealOn="tap" decimals={0} />}
                    tone="accent"
                    tooltip={t('market.appraisal.cheapestBuyHelp')}
                  />
                )}
                <StatChip label={t('market.appraisal.items')} value={rows.length} />
                {loading && <Spinner label={t('common.loading')} size="sm" />}
              </div>

              {net && (
                <AssumesBaseStandingsNote
                  className="border-b border-line px-3"
                  hint={t('market.appraisal.assumesBaseStandingsHint')}
                />
              )}

              {hasRefine && refinesOreOrIce && (
                <div className="border-b border-line px-3 empty:hidden">
                  <ImplantsAssumedNote hint={t('market.appraisal.refineAssumesNoImplantsHint')} />
                </div>
              )}

              {totals.unpricedRows > 0 && (
                <p className="border-b border-line px-3 py-2 text-[0.6875rem] text-warning">
                  {t('market.appraisal.unpriced', { count: totals.unpricedRows })}
                </p>
              )}
              {totals.refineUnpricedRows > 0 && (
                <p className="border-b border-line px-3 py-2 text-[0.6875rem] text-warning">
                  {t('market.appraisal.refineUnpriced', { count: totals.refineUnpricedRows })}
                </p>
              )}
              {totals.cheapestBuyViaLp > 0 && (
                <p className="border-b border-line px-3 py-2 text-[0.6875rem] text-text-dim">
                  {t('market.appraisal.cheapestBuyViaLp', { count: totals.cheapestBuyViaLp })}
                </p>
              )}

              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(row) => row.typeId}
                label={t('market.appraisal.resultTitle')}
                className="pb-1"
                rowContextMenu={rowContextMenu}
                rowMoreActions
                // Five or six short figures a card: one per line runs a priced
                // row to six, and hiding a column buys the same height at the
                // cost of a figure.
                stackColumns={2}
                mobileSort
              />
            </>
          )}
        </Panel>

        {compare !== null && (
          // Deliberately not a panel: the hub cards are panel surfaces
          // themselves, so framing them put a box around five boxes. The fold
          // survives as a bare heading-plus-caret row on the page ground — the
          // caret stays its own `IconButton` rather than swallowing the
          // heading, so the toggle's accessible name is not an `aria-label`
          // overriding visible text (WCAG 2.5.3).
          <section aria-labelledby="market-appraisal-compare-hubs">
            <div className="flex min-h-9 items-center gap-1">
              <h2
                id="market-appraisal-compare-hubs"
                className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase"
              >
                {t('market.appraisal.compareHubsTitle')}
              </h2>
              <IconButton
                size="sm"
                icon={<Caret expanded={compareExpanded} />}
                label={
                  compareExpanded
                    ? t('market.appraisal.compareHubsHide')
                    : t('market.appraisal.compareHubsShow')
                }
                aria-expanded={compareExpanded}
                onClick={() => setCompareExpanded((open) => !open)}
              />
            </div>
            {compareExpanded && <HubCompareCards rows={compare} />}
          </section>
        )}
      </div>
    </div>
  );
}
