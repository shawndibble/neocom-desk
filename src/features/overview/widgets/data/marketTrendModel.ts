/**
 * The Market Trend widget's builder: the Quickbar's first items as a table of
 * latest daily average with 7 and 30 day change, and as lines indexed to 0%
 * at the start of the widget's range so a 5 ISK mineral and a 5M ISK PLEX
 * share one scale. Daily averages only (ESI's `average`), the same series
 * Price History's "average" choice draws. Pure, like every builder.
 */
import { indexToStart, alignTrendSeries, percentChange } from '@/engine/market/priceTrend';
import { formatIskCompact } from '@/lib/isk';
import type { ChartColor, ChartModel } from '../charts/types';
import { blank, statusOf, UNKNOWN, type Builder } from './builderKit';
import { signedCell } from './cellKit';
import { dayTitle, signTone } from './chartTips';
import type { MarketTrendItem } from './kindLoaders';
import type { KindView, TableRowModel } from './types';

const D = 'overview.widgets.data.marketTrend';
const C = 'overview.widgets.chart.marketTrend';
const W = 'overview.widgets.marketTrend';
const MARKET_PATH = '/market/browser';
const COLORS: ChartColor[] = ['accent', 's1', 's2', 's3', 's4', 's5'];

/** `+12.4%` / `-3.0%`: the sign is part of the text, so colour is never the only cue. */
export function trendText(change: number | null): string {
  if (change === null) return UNKNOWN;
  const pct = change * 100;
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

const latestAverage = (item: MarketTrendItem): number | null =>
  item.points.length === 0
    ? null
    : [...item.points].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!.average;

export const marketTrend: Builder = (feeds, { t, range }) => {
  const feed = feeds.marketTrend;
  const data = feed?.data ?? null;
  if (!data) return blank(MARKET_PATH, statusOf(feed));
  if (data.items.length === 0) {
    return {
      ...blank(MARKET_PATH, statusOf(feed, { isEmpty: true })),
      emptyHint: t(`${W}.emptyHint`),
    };
  }

  const changes = data.items.map((item) => ({
    item,
    d7: percentChange(item.points, 7),
    d30: percentChange(item.points, 30),
    now: latestAverage(item),
  }));
  const rows: TableRowModel[] = changes.map(({ item, d7, d30, now }) => ({
    key: String(item.typeId),
    to: item.to,
    cells: [
      item.name,
      now === null ? UNKNOWN : { text: formatIskCompact(now), iskAmount: now },
      d7 === null ? UNKNOWN : signedCell(trendText(d7), d7),
      d30 === null ? UNKNOWN : signedCell(trendText(d30), d30),
    ],
    sort: [item.name, now ?? undefined, d7 ?? undefined, d30 ?? undefined],
  }));
  const table = {
    columns: [
      { key: 'item', label: t(`${W}.col.item`), priority: 0, nameFloor: true },
      { key: 'now', label: t(`${W}.col.now`), align: 'end' as const, priority: 1 },
      { key: 'd7', label: t(`${W}.col.d7`), align: 'end' as const, priority: 2 },
      { key: 'd30', label: t(`${W}.col.d30`), align: 'end' as const, priority: 3 },
    ],
    rows,
    footer: t(`${D}.footer`, { hub: data.hubName }),
  };

  const mover = changes
    .filter((c) => c.d7 !== null)
    .sort((a, b) => Math.abs(b.d7!) - Math.abs(a.d7!))[0];
  const base: KindView = {
    ...blank(MARKET_PATH, statusOf(feed)),
    fetchedAt: data.fetchedAt,
    fromCache: data.items.some((i) => i.fromCache),
    number: mover
      ? {
          value: trendText(mover.d7),
          unit: t(`${D}.unit`, { item: mover.item.name, days: 7 }),
          secondary: { text: t(`${D}.footer`, { hub: data.hubName }) },
          notes: data.omitted > 0 ? [t(`${D}.omitted`, { count: data.omitted })] : [],
          tone: 'clear',
        }
      : { value: UNKNOWN, unit: t(`${D}.noHistory`), tone: 'clear' },
    summary: t(`${C}.summary`, { count: data.items.length, days: range, hub: data.hubName }),
    table,
  };

  const axis = alignTrendSeries(
    data.items.map((i) => i.points),
    range
  );
  const indexed = axis.values.map(indexToStart);
  const plotted = indexed.flatMap((v, i) => (v.some((x) => x !== null) ? [i] : []));
  if (axis.dates.length < 2 || plotted.length === 0) return base;

  const rel = (v: number) => v / 100 - 1;
  const all = plotted.flatMap((i) => indexed[i]!.filter((v): v is number => v !== null));
  const lastOf = (values: (number | null)[]) => values.filter((v) => v !== null).at(-1) ?? null;
  const chart: ChartModel = {
    kind: 'lines',
    summary: [
      t(`${C}.summary`, { count: plotted.length, days: range, hub: data.hubName }),
      ...plotted.map((i) =>
        t(`${C}.summaryLine`, {
          item: data.items[i]!.name,
          change: trendText(lastOf(indexed[i]!) === null ? null : rel(lastOf(indexed[i]!)!)),
        })
      ),
    ].join(' '),
    note: t(`${C}.note`, { hub: data.hubName }),
    low: trendText(rel(Math.min(...all))),
    high: trendText(rel(Math.max(...all))),
    rangeLabel: t(`${C}.range`, { days: range }),
    series: plotted.map((i, n) => {
      const end = lastOf(indexed[i]!);
      return {
        key: String(data.items[i]!.typeId),
        label: data.items[i]!.name,
        color: COLORS[n % COLORS.length]!,
        end: trendText(end === null ? null : rel(end)),
        values: indexed[i]!.map((v) => (v === null ? null : rel(v) * 100)),
      };
    }),
    tips: axis.dates.map((date, d) => ({
      title: dayTitle(date),
      rows: plotted.flatMap((i) => {
        const index = indexed[i]![d];
        const price = axis.values[i]![d];
        if (index === null || index === undefined || price === null || price === undefined)
          return [];
        const change = rel(index);
        return [
          {
            label: data.items[i]!.name,
            value: `${trendText(change)} · ${formatIskCompact(price)}`,
            tone: signTone(change),
          },
        ];
      }),
    })),
  };
  return { ...base, chart };
};
