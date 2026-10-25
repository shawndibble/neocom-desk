/**
 * The Profit widget: what the pilot made over 7, 30 or 90 days, from the
 * widget's Source (decision `20261024-191335`). Builds is the logged industry
 * runs (`buildProfit`), Trading the market sales priced against the buys they
 * used up (`tradingProfit`), each drawn exactly as its own widget was; Both
 * adds them up here, with the summing in `profitCombine.ts`.
 *
 * Scope: Builds reads the header Character's logged runs only, so Both does
 * too, and narrows Trading to the same Character; only Trading alone can pool
 * every Character (`KindDef.bySettings` in `kindModels.ts`).
 */
import { formatIskCompactSigned } from '@/lib/isk';
import { WALLET_TRADE_ENDPOINTS } from '../kinds';
import { blank, statusOf, UNKNOWN, type Builder } from './builderKit';
import { signedCell } from './cellKit';
import { rollingTitles, signTone } from './chartTips';
import { combineProfit, type ProfitOrigin } from './profitCombine';
import { readTrading, tradingNotes, tradingProfit, tradingSource } from './tradingProfitModel';
import type { KindView, ListRow, TableModel } from './types';
import { buildProfit, buildsSource, vsPrevious } from './worldModels';

// Keys a `${prefix}.word` template names pin `word` in every lazy locale section into the
// startup shell (localeSplit's third shape), so a key whose last segment is common stays literal.
const W = 'overview.widgets.profit';
const C = 'overview.widgets.chart.profit';
/** The chart strings every bar chart shares. */
const CS = 'overview.widgets.chart';

export const profit: Builder = (feeds, ctx) => {
  if (ctx.profitSource === 'trading') return tradingProfit(feeds, ctx);
  if (ctx.profitSource === 'both') return bothProfit(feeds, ctx);
  return buildProfit(feeds, ctx);
};

/**
 * Builds plus Trading. The builds read leads: until it lands the widget is
 * loading, and its failure is the widget's. A Trading read that failed, or a
 * Character that cannot read its wallet, leaves the builds alone on show, with
 * a note or a Grant access saying what is missing.
 */
const bothProfit: Builder = (feeds, ctx) => {
  const { t, now, range } = ctx;
  const to = '/industry';
  const buildsFeed = feeds.profit;
  const tradingFeed = feeds.tradingProfit;
  const builds = buildsFeed?.data ?? null;
  const trades = tradingFeed?.data ?? null;
  if (!builds) return blank(to, statusOf(buildsFeed));
  // One figure from two reads: wait for both rather than redraw when the second lands.
  if (!trades && (tradingFeed?.loading ?? true)) {
    return blank(to, statusOf(buildsFeed, { loading: true, hasData: false }));
  }
  const read = trades ? readTrading(trades, ctx) : null;
  const tradingFailed = !trades;
  const combined = combineProfit(
    buildsSource(builds, now, range),
    read ? tradingSource(read, now, range) : null,
    now,
    range
  );
  const label = (source: ProfitOrigin) => t(`overview.widgets.profit.source.${source}`);
  const { builds: buildsTotal, trading: tradingTotal } = combined.totals;

  const notes = [
    ...(trades && read && read.total.sales > 0 ? tradingNotes(t, trades, read) : []),
    tradingFailed ? t(`${W}.tradingFailed`) : '',
  ].filter(Boolean);

  const table: TableModel = {
    columns: [
      { key: 'name', label: t(`${W}.col.name`), priority: 0 },
      { key: 'profit', label: t(`${W}.col.profit`), align: 'end', priority: 1 },
      { key: 'source', label: t(`${W}.col.source`), priority: 2 },
    ],
    rows: combined.rows.map((row) => ({
      key: `${row.source}:${row.key}`,
      // Toned like Trading's own table, so a gain or a loss reads the same from either source.
      cells: [
        row.name,
        row.profit === null ? UNKNOWN : signedCell(formatIskCompactSigned(row.profit), row.profit),
        label(row.source),
      ],
      tone: row.profit !== null && row.profit < 0 ? 'watch' : 'clear',
    })),
  };

  const { daily, buckets } = combined.buckets;
  const { builds: buildValues, trading: tradeValues, total: totals } = combined.series;
  const summary = t('overview.widgets.chart.profit.summaryBoth', {
    total: formatIskCompactSigned(combined.total),
    builds: formatIskCompactSigned(buildsTotal),
    trading: formatIskCompactSigned(tradingTotal),
    range,
    buckets: totals.map((v) => formatIskCompactSigned(v)).join(', '),
  });
  const known = [...buildValues, ...tradeValues];
  const drawn = known.some((v) => v !== 0);
  const listRows: ListRow[] = combined.rows.map((row) => ({
    key: `${row.source}:${row.key}`,
    title: row.name,
    detail: label(row.source),
    value: row.profit === null ? UNKNOWN : formatIskCompactSigned(row.profit),
    ...(row.profit === null ? {} : { iskAmount: row.profit }),
    tone: 'clear',
  }));
  const empty = builds.runs.length === 0 && (read === null || read.total.sales === 0);

  const view: KindView = {
    ...blank(to, statusOf(buildsFeed, { isEmpty: empty })),
    ...(trades ? { fetchedAt: trades.fetchedAt } : {}),
    emptyMessage: t('overview.widgets.profit.emptyBoth'),
    // A Character in scope with no wallet read: the builds still show, with the grant Trading needs under them.
    ...(trades && read === null ? { grantEndpoints: WALLET_TRADE_ENDPOINTS } : {}),
    number: {
      value: formatIskCompactSigned(combined.total),
      iskAmount: combined.total,
      unit: t('overview.isk'),
      ...(combined.delta !== null ? { secondary: vsPrevious(t, combined.delta, range) } : {}),
      ...(notes.length > 0 ? { notes } : {}),
      tone: 'clear',
    },
    rows: listRows,
    table,
    summary,
    chart: !drawn
      ? undefined
      : {
          kind: 'lines',
          series: [
            {
              key: 'builds',
              label: label('builds'),
              color: 's1',
              // The legend reads where the line ends: the latest period.
              end: formatIskCompactSigned(buildValues.at(-1) ?? 0),
              values: buildValues,
            },
            {
              key: 'trading',
              label: label('trading'),
              color: 's2',
              end: formatIskCompactSigned(tradeValues.at(-1) ?? 0),
              values: tradeValues,
            },
          ],
          low: formatIskCompactSigned(Math.min(...known)),
          high: formatIskCompactSigned(Math.max(...known)),
          xStart: t(daily ? `${CS}.daysAgo` : `${CS}.weeksAgo`, { count: buckets }),
          xEnd: t(daily ? `${CS}.today` : 'overview.widgets.chart.thisWeek'),
          tips: rollingTitles(t, daily ? 'day' : 'week', buckets).map((title, i) => ({
            title,
            rows: [
              {
                label: label('builds'),
                value: formatIskCompactSigned(buildValues[i]!),
                tone: signTone(buildValues[i]!),
              },
              {
                label: label('trading'),
                value: formatIskCompactSigned(tradeValues[i]!),
                tone: signTone(tradeValues[i]!),
              },
              {
                label: t(`${C}.tipTotal`),
                value: formatIskCompactSigned(totals[i]!),
                tone: signTone(totals[i]!),
              },
            ],
          })),
          note: t(daily ? `${C}.noteBothDaily` : `${C}.noteBothWeekly`),
          summary,
        },
  };
  return view;
};
