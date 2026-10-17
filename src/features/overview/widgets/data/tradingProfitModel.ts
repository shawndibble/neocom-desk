/**
 * The Trading profit widget's builder (issue #3995): what the market sales in
 * the last 7, 30 or 90 days made, priced against the wallet buys they used up,
 * with the broker fees paid over the same days beside it (never taken off).
 * Header Character, or every Character pooled so an alt's buys price a main's
 * sales. Pure, like every builder.
 */
import { sumBrokerFees, sumMargins, marginsByItem } from '@/engine/market/tradingProfit';
import { pooledTransactionMargins, transactionMargins } from '@/features/market/transactionMargins';
import type { WalletTransaction } from '@/esi/endpoints';
import { DAY_MS } from '@/lib/age';
import { formatIskCompact, formatIskCompactSigned } from '@/lib/isk';
import { blank, statusOf, UNKNOWN, type Builder } from './builderKit';
import { signedCell } from './cellKit';
import { backwardBucketSums } from './chartSeries';
import { rollingTitles, signTone } from './chartTips';
import type { TableModel } from './types';

const D = 'overview.widgets.data.tradingProfit';
const C = 'overview.widgets.chart.tradingProfit';
/** The chart strings every bar chart shares. */
const CS = 'overview.widgets.chart';
const W = 'overview.widgets.tradingProfit';
/** The Market's History tab, where the sales behind the figure live. */
const HISTORY_PATH = '/market/history';

export const tradingProfit: Builder = (feeds, { t, now, range, scopeAll, activeCharacterId }) => {
  const feed = feeds.tradingProfit;
  const data = feed?.data ?? null;
  if (!data) return blank(HISTORY_PATH, statusOf(feed));

  const everyone = scopeAll || activeCharacterId === null;
  const characters = everyone
    ? data.characters
    : data.characters.filter((c) => c.characterId === activeCharacterId);
  const held = characters.length > 0;
  const base = {
    ...blank(HISTORY_PATH, statusOf(feed, { needsPermission: !held })),
    fetchedAt: data.fetchedAt,
  };
  if (!held) return base;

  // Priced over every fill held, not just the window: a sale's cost sits in older buys.
  let fills: readonly WalletTransaction[];
  let margins: ReturnType<typeof transactionMargins>;
  if (everyone && characters.length > 1) {
    const pooled = pooledTransactionMargins(characters);
    fills = pooled.rows;
    margins = pooled.margins;
  } else {
    const only = characters[0]!;
    fills = only.transactions;
    margins = transactionMargins(only.transactions, only.journal);
  }
  const from = now - range * DAY_MS;
  const sales = fills.filter(
    (f) => !f.is_buy && Date.parse(f.date) >= from && Date.parse(f.date) <= now
  );
  const saleFills = sales.map((f) => ({
    transactionId: f.transaction_id,
    date: f.date,
    typeId: f.type_id,
    isBuy: false,
  }));
  const total = sumMargins(saleFills, margins);
  const brokerFees = sumBrokerFees(
    characters.flatMap((c) => c.journal),
    from,
    now
  );
  const nameOf = (typeId: number) => data.names.get(typeId) ?? `#${typeId}`;
  const items = marginsByItem(saleFills, margins);

  const matchedNote = t(`${D}.matched`, { matched: total.matched, count: total.sales });
  const notes = [
    t(`${D}.fees`, { amount: formatIskCompact(brokerFees) }),
    matchedNote,
    data.truncated ? t(`${C}.truncated`) : '',
    everyone && data.skippedCount > 0 ? t(`${C}.skipped`, { count: data.skippedCount }) : '',
  ].filter(Boolean);

  const matchedSales = sales.filter((f) => margins.has(f.transaction_id));
  const values = backwardBucketSums(
    matchedSales,
    (f) => Date.parse(f.date),
    (f) => margins.get(f.transaction_id)!.margin,
    now,
    DAY_MS,
    range
  );
  const summary = t(`${C}.summary`, {
    total: formatIskCompactSigned(total.margin),
    matched: total.matched,
    count: total.sales,
    range,
  });
  const table: TableModel = {
    columns: [
      { key: 'item', label: t(`${W}.col.item`), priority: 0 },
      { key: 'sales', label: t(`${W}.col.sales`), align: 'end', priority: 2 },
      { key: 'margin', label: t(`${W}.col.margin`), align: 'end', priority: 1 },
    ],
    rows: items.map((item) => ({
      key: String(item.typeId),
      cells: [
        nameOf(item.typeId),
        String(item.sales),
        item.matched === 0 ? UNKNOWN : signedCell(formatIskCompactSigned(item.margin), item.margin),
      ],
    })),
    footer: t(`${D}.fees`, { amount: formatIskCompact(brokerFees) }),
  };
  const empty = total.sales === 0;
  return {
    ...base,
    ...blank(HISTORY_PATH, statusOf(feed, { isEmpty: empty })),
    fetchedAt: data.fetchedAt,
    number: {
      value: total.matched > 0 ? formatIskCompactSigned(total.margin) : UNKNOWN,
      ...(total.matched > 0 ? { iskAmount: total.margin } : {}),
      unit: t(`${D}.unit`, { count: range }),
      notes,
      tone: 'clear',
    },
    table,
    summary,
    chart:
      matchedSales.length === 0
        ? undefined
        : {
            kind: 'bars',
            values,
            gains: true,
            max: t(`${CS}.max`, { value: formatIskCompact(Math.max(0, ...values)) }),
            barLabels: values.map((v) => (v === 0 ? '' : formatIskCompactSigned(v))),
            xStart: t(`${CS}.daysAgo`, { count: range }),
            xEnd: t(`${CS}.today`),
            tips: rollingTitles(t, 'day', range).map((title, i) => ({
              title,
              rows: [
                {
                  label: t(`${C}.tip.margin`),
                  value: formatIskCompactSigned(values[i]!),
                  tone: signTone(values[i]!),
                },
              ],
            })),
            note: [t(`${C}.note`), matchedNote].join(' '),
            summary,
          },
  };
};
