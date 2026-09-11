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
 * `Panel` above an optional Compare Hubs `CollapsiblePanel` once something
 * has been appraised.
 */
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  CollapsiblePanel,
  DataTable,
  EmptyState,
  IconButton,
  Panel,
  Spinner,
  StatChip,
  TextInput,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { fieldBaseClassName } from '@/components/ui/controlStyles';
import type { AppraisalRow } from '@/engine/market/appraisal';
import { countPasteLines } from '@/engine/market/appraisalPaste';
import { iskToneClass } from '@/features/character/format';
import type { BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { writeToClipboard } from '@/lib/clipboard';
import { formatIsk, formatIskAuto } from '@/lib/isk';
import { downloadCsv } from '@/lib/downloadCsv';
import type { TradeHub } from '@/market/hubs';
import type { HubComparisonRow } from './appraisalData';
import { appraisalCsvColumns } from './appraisalCsv';
import { buildAppraisalShareLink, MAX_SHARE_ITEMS } from './appraisalShareData';
import { formatVolume } from './format';
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
  /** Same per-item context menu as the tree and the Variations table: null until requested, then per-typeId lookups. */
  blueprintCatalog: BlueprintCatalog | null;
  onRequestBlueprintCatalog: () => void;
  onAddToQuickbar: (typeId: number, itemName: string) => void;
  quickbarAvailable: boolean;
  onShowInfo: (typeId: number, itemName: string) => void;
  /** Opens the Compare Hubs panel already expanded — the Quickbar's "View in Appraisal" action (#726) lands directly on the multi-hub view rather than a collapsed one. */
  defaultCompareExpanded?: boolean;
}

/** A missing price is a dash, never a zero — the house placeholder. */
function iskCell(value: number | null, decimals: 'auto' | 0): string {
  if (value === null) return '—';
  return decimals === 'auto' ? formatIskAuto(value) : formatIsk(value);
}

/**
 * "Sell-as-is" is `buyTotal` in this engine's own vocabulary — what the list
 * fetches sold into buy orders right now (`market.appraisal.buyTotalHelp`) —
 * so that is what the refine-then-sell comparison is judged against, the
 * same axis `orderExits.ts` prices its own refine exit on.
 */
function refineBeatsSellAsIs(row: AppraisalRow): boolean {
  return row.refineTotal !== undefined && row.buyTotal !== null && row.refineTotal > row.buyTotal;
}

/** Bolds a total only when it actually won a real comparison — never on a row with nothing to compare against. */
function comparisonCell(text: string, highlighted: boolean, suffix?: ReactElement | false) {
  return (
    <span className={highlighted ? 'font-semibold text-accent' : undefined}>
      {text}
      {suffix}
    </span>
  );
}

export function AppraisalPanel({
  controller,
  pricePercent,
  onPricePercentChange,
  hub,
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
  const hubName = hub.systemName;

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
      // A count, not ISK — `formatIsk` would run `clampIskZero` over it.
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
    {
      id: 'buyEach',
      header: t('market.appraisal.columnBuyEach'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => iskCell(row.buyEach, 'auto'),
      sortValue: (row) => row.buyEach ?? undefined,
    },
    {
      id: 'sellEach',
      header: t('market.appraisal.columnSellEach'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => iskCell(row.sellEach, 'auto'),
      sortValue: (row) => row.sellEach ?? undefined,
    },
    {
      id: 'buyTotal',
      header: t('market.appraisal.columnBuyTotal'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) =>
        comparisonCell(
          iskCell(row.buyTotal, 0),
          row.refineTotal !== undefined && !refineBeatsSellAsIs(row)
        ),
      sortValue: (row) => row.buyTotal ?? undefined,
    },
    {
      id: 'sellTotal',
      header: t('market.appraisal.columnSellTotal'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => iskCell(row.sellTotal, 0),
      sortValue: (row) => row.sellTotal ?? undefined,
    },
  ];

  const rows = result?.appraisal.rows ?? [];
  const totals = result?.appraisal.totals;
  const unmatched = result?.unmatched ?? [];
  // Undefined per row when the type has no reprocessing data at all — the
  // column only earns its place on screen when at least one row has
  // something to show, which is also exactly when there is nothing to show
  // with no active Character (`appraisalData.ts` never sets `refine` then).
  const hasRefine = rows.some((row) => row.refineTotal !== undefined);
  if (hasRefine) {
    columns.push({
      id: 'refineTotal',
      header: t('market.appraisal.columnRefineTotal'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) =>
        row.refineTotal === undefined
          ? '—'
          : comparisonCell(
              iskCell(row.refineTotal, 0),
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
    });
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

  const compareColumns: DataTableColumn<HubComparisonRow>[] = [
    {
      id: 'hub',
      header: t('market.appraisal.columnHub'),
      primary: true,
      render: (row) => row.hub.systemName,
      sortValue: (row) => row.hub.systemName,
    },
    {
      id: 'sellTotal',
      header: t('market.appraisal.columnSellTotal'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => iskCell(row.sell, 0),
      sortValue: (row) => row.sell ?? undefined,
    },
    {
      id: 'buyTotal',
      header: t('market.appraisal.columnBuyTotal'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => iskCell(row.buy, 0),
      sortValue: (row) => row.buy ?? undefined,
    },
  ];

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
            <span className="text-xs text-text-faint">
              {t('market.appraisal.pricePercentHint')}
            </span>
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
                  value={formatIsk(totals.sell)}
                  tone="accent"
                  tooltip={t('market.appraisal.sellTotalHelp')}
                />
                <StatChip
                  label={t('market.appraisal.buyTotal')}
                  value={formatIsk(totals.buy)}
                  tooltip={t('market.appraisal.buyTotalHelp')}
                />
                <StatChip
                  label={t('market.appraisal.spread')}
                  value={
                    <span className={iskToneClass(totals.spread)}>{formatIsk(totals.spread)}</span>
                  }
                />
                {hasRefine && (
                  <StatChip
                    label={t('market.appraisal.refineTotal')}
                    value={formatIsk(totals.refine)}
                    tooltip={t('market.appraisal.refineTotalHelp')}
                  />
                )}
                <StatChip label={t('market.appraisal.items')} value={rows.length} />
                {loading && <Spinner label={t('common.loading')} size="sm" />}
              </div>

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

              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(row) => row.typeId}
                label={t('market.appraisal.resultTitle')}
                className="pb-1"
                rowContextMenu={rowContextMenu}
              />
            </>
          )}
        </Panel>

        {compare !== null && (
          <CollapsiblePanel
            title={t('market.appraisal.compareHubsTitle')}
            expanded={compareExpanded}
            onToggle={() => setCompareExpanded((open) => !open)}
            labels={{
              show: t('market.appraisal.compareHubsShow'),
              hide: t('market.appraisal.compareHubsHide'),
            }}
            padded={false}
          >
            <DataTable
              columns={compareColumns}
              rows={compare}
              rowKey={(row) => row.hub.id}
              label={t('market.appraisal.compareHubsTitle')}
              density="compact"
            />
          </CollapsiblePanel>
        )}
      </div>
    </div>
  );
}
