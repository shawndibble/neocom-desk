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
 * Both halves are one `Panel` each in the Browser's own two-column grid, but
 * narrower on the left: a paste box does not need the width the Market Group
 * tree does.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
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
import type { AppraisalRow } from '@/engine/market/appraisal';
import { iskToneClass } from '@/features/character/format';
import { formatIsk, formatIskAuto } from '@/lib/isk';
import { downloadCsv } from '@/lib/downloadCsv';
import { appraisalCsvColumns } from './appraisalCsv';
import { isValidPricePercent, MAX_PRICE_PERCENT, MIN_PRICE_PERCENT } from './pricePercent';
import type { AppraisalController } from './useAppraisal';

interface AppraisalPanelProps {
  controller: AppraisalController;
  pricePercent: number;
  onPricePercentChange: (value: number) => void;
  /** The hub the figures are quoted at, for the panel's own provenance chip. */
  hubName: string;
}

/** A missing price is a dash, never a zero — the house placeholder. */
function iskCell(value: number | null, decimals: 'auto' | 0): string {
  if (value === null) return '—';
  return decimals === 'auto' ? formatIskAuto(value) : formatIsk(value);
}

export function AppraisalPanel({
  controller,
  pricePercent,
  onPricePercentChange,
  hubName,
}: AppraisalPanelProps) {
  const { t } = useTranslation();
  const { text, setText, result, loading, failed } = controller;

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
      render: (row) => formatIsk(row.quantity),
      sortValue: (row) => row.quantity,
    },
    {
      id: 'item',
      header: t('market.appraisal.columnItem'),
      primary: true,
      render: (row) => row.name,
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
      render: (row) => iskCell(row.buyTotal, 0),
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

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[21rem_1fr] lg:items-start">
      <Panel
        title={t('market.appraisal.pasteTitle')}
        meta={
          controller.canAppraise ? (
            <StatChip
              label={t('market.appraisal.linesLabel')}
              value={text.split(/\r\n|\r|\n/).filter((line) => line.trim() !== '').length}
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
            className="w-full rounded-xs border border-line bg-panel-2 p-2 font-mono text-[0.6875rem] text-text placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-accent"
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

      <Panel
        title={t('market.appraisal.resultTitle')}
        padded={result === null}
        meta={
          result !== null ? (
            <StatChip label={hubName} value={t('market.appraisal.atPercent', { pricePercent })} />
          ) : undefined
        }
        actions={
          <IconButton
            size="sm"
            icon={<Icon.Download />}
            label={t('market.appraisal.exportCsv')}
            disabled={rows.length === 0}
            onClick={() =>
              downloadCsv('market-appraisal', rows, appraisalCsvColumns(t), new Date())
            }
          />
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
              <StatChip label={t('market.appraisal.items')} value={rows.length} />
              {loading && <Spinner label={t('common.loading')} size="sm" />}
            </div>

            {totals.unpricedRows > 0 && (
              <p className="border-b border-line px-3 py-2 text-[0.6875rem] text-warning">
                {t('market.appraisal.unpriced', { count: totals.unpricedRows })}
              </p>
            )}

            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(row) => row.typeId}
              label={t('market.appraisal.resultTitle')}
              className="pb-1"
            />
          </>
        )}
      </Panel>
    </div>
  );
}
