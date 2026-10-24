/**
 * The Market Trend widget's builder: the widget's items (its own picks, else
 * the Quickbar's first) at its Trade Hubs (its own picks, else the pilot's
 * Market hub) as a table of latest daily average with 7 and 30 day change, and
 * as lines indexed to 0% at the start of the widget's range so a 5 ISK mineral
 * and a 5M ISK PLEX share one scale. Daily averages only (ESI's `average`), the same series
 * Price History's "average" choice draws. Pure, like every builder.
 */
import {
  alignTrendSeries,
  indexToStart,
  isPricedDay,
  percentChange,
  trailingAverage,
} from '@/engine/market/priceTrend';
import { planTrendSeries } from '@/engine/market/trendSeries';
import { getTradeHub } from '@/market/hubs';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatIskCompact } from '@/lib/isk';
import type { ChartColor, ChartModel } from '../charts/types';
import { blank, statusOf, UNKNOWN, type Builder } from './builderKit';
import { signedCell } from './cellKit';
import { dayTitle, signTone } from './chartTips';
import type { MarketTrendFeed, MarketTrendSeries } from './marketTrendLoader';
import type { BuildContext, FeedState, KindView, TableRowModel } from './types';

const D = 'overview.widgets.data.marketTrend';
const C = 'overview.widgets.chart.marketTrend';
const W = 'overview.widgets.marketTrend';
const MARKET_PATH = '/market/browser';
/** Ranges long enough that daily noise zigzags: their lines plot a trailing average instead. */
const SMOOTH_FROM_DAYS = 30;
const SMOOTH_WINDOW = 7;
const COLORS: ChartColor[] = ['accent', 's1', 's2', 's3', 's4', 's5'];

/** `+12.4%` / `-3.0%`: the sign is part of the text, so colour is never the only cue. */
export function trendText(change: number | null): string {
  if (change === null) return UNKNOWN;
  const pct = change * 100;
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

/** A line as drawn: the read, labelled with its hub when the widget compares several. */
type TrendLine = MarketTrendSeries & { label: string };

interface ResolvedTrend {
  hubName: string;
  /** Every drawn line is a global-market item, so the hubs do not describe where it is priced. */
  allGlobal: boolean;
  lines: TrendLine[];
  omitted: number;
  /** A pick the feed has not read yet, so the view waits rather than draw a part. */
  pending: boolean;
}

function resolveTrend(
  feed: MarketTrendFeed,
  { trendItems, trendHubs }: Pick<BuildContext, 'trendItems' | 'trendHubs'>
): ResolvedTrend {
  const typeIds = trendItems ?? feed.quickbar.map((item) => item.typeId);
  const hubIds = trendHubs ?? [feed.defaultHubId];
  const global = new Set(feed.globalTypeIds);
  const plan = planTrendSeries(typeIds, hubIds, (id) => global.has(id));
  const hubName = (id: string) => getTradeHub(id)?.systemName ?? id;
  const several = hubIds.length > 1;
  const lines: TrendLine[] = [];
  for (const ref of plan.refs) {
    const series = feed.series[ref.key];
    if (series === undefined) continue;
    lines.push({
      ...series,
      label: several && ref.hubId !== null ? `${series.name} · ${hubName(ref.hubId)}` : series.name,
    });
  }
  return {
    hubName: hubIds.map(hubName).join(', '),
    allGlobal: lines.length > 0 && lines.every((l) => l.hubId === null),
    lines,
    omitted: plan.omitted,
    pending: lines.length < plan.refs.length,
  };
}

/** The newest day with a real price: a zero-average row is a day nothing traded, not a price. */
const latestAverage = (item: MarketTrendSeries): number | null =>
  item.points
    .filter(isPricedDay)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1)?.average ?? null;

export const marketTrend: Builder = (feeds, { t, range, trendItems, trendHubs }) => {
  const feed: FeedState<MarketTrendFeed> | undefined = feeds.marketTrend;
  const raw = feed?.data ?? null;
  if (!raw) return blank(MARKET_PATH, statusOf(feed));
  const resolved = resolveTrend(raw, { trendItems, trendHubs });
  // A failed reload leaves the old read without the new picks: that is an error, not a spinner.
  if (resolved.pending) {
    return blank(MARKET_PATH, statusOf(feed, { loading: !feed?.error, hasData: false }));
  }
  const data = { ...resolved, items: resolved.lines, fetchedAt: raw.fetchedAt };
  const where = data.allGlobal
    ? t(`${C}.whereGlobal`, { items: [...new Set(data.items.map((i) => i.name))].join(', ') })
    : t(`${C}.whereHub`, { hub: data.hubName });
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
  const names = (flag: (i: TrendLine) => boolean) => data.items.filter(flag).map((i) => i.label);
  const missing = names((i) => !i.points.some(isPricedDay) && !i.failed);
  const failedNames = names((i) => i.failed);
  // Said wherever the lines are, so a pick that cannot be drawn is never just absent.
  const notes = [
    ...(failedNames.length > 0
      ? [t(`${C}.noteFailed`, { count: failedNames.length, lines: failedNames.join(', ') })]
      : []),
    ...(missing.length > 0
      ? [t(`${C}.noteNoHistory`, { count: missing.length, lines: missing.join(', ') })]
      : []),
    ...(data.omitted > 0 ? [t(`${D}.omitted`, { count: data.omitted })] : []),
  ];
  const rows: TableRowModel[] = changes.map(({ item, d7, d30, now }) => ({
    key: item.key,
    to: item.to,
    cells: [
      item.label,
      now === null
        ? item.failed
          ? t(`${D}.failedCell`)
          : UNKNOWN
        : { text: formatIskCompact(now), iskAmount: now },
      d7 === null ? UNKNOWN : signedCell(trendText(d7), d7),
      d30 === null ? UNKNOWN : signedCell(trendText(d30), d30),
    ],
    sort: [item.label, now ?? undefined, d7 ?? undefined, d30 ?? undefined],
  }));
  const table = {
    columns: [
      { key: 'item', label: t(`${W}.col.item`), priority: 0, nameFloor: true },
      { key: 'now', label: t(`${W}.col.now`), align: 'end' as const, priority: 1 },
      { key: 'd7', label: t(`${W}.col.d7`), align: 'end' as const, priority: 2 },
      { key: 'd30', label: t(`${W}.col.d30`), align: 'end' as const, priority: 3 },
    ],
    rows,
    footer: [t(`${D}.footer`, { where }), ...notes].join(' '),
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
          unit: t(`${D}.unit`, { item: mover.item.label, days: 7 }),
          secondary: { text: t(`${D}.footer`, { where }) },
          notes: data.omitted > 0 ? [t(`${D}.omitted`, { count: data.omitted })] : [],
          tone: 'clear',
        }
      : { value: UNKNOWN, unit: t(`${D}.noHistory`), tone: 'clear' },
    summary: t(`${C}.summary`, { count: data.items.length, days: range, where }),
    table,
  };

  const axis = alignTrendSeries(
    data.items.map((i) => i.points),
    range
  );
  const indexed = axis.values.map(indexToStart);
  const plotted = indexed.flatMap((v, i) => (v.some((x) => x !== null) ? [i] : []));
  if (axis.dates.length < 2 || plotted.length === 0) return base;

  const volumes = data.items.map((i) => new Map(i.points.map((p) => [p.date, p.volume])));
  const rel = (v: number) => v / 100 - 1;
  const smoothed = range >= SMOOTH_FROM_DAYS;
  const lastOf = (values: (number | null)[]) => values.filter((v) => v !== null).at(-1) ?? null;
  // Percent change per day; a long range draws its trailing average so the tooltip (raw) keeps the real day.
  const lineValues = (values: (number | null)[]) => {
    const pct = values.map((v) => (v === null ? null : rel(v) * 100));
    if (!smoothed) return pct;
    // The average bridges nothing: a day with no price stays a gap, and a line stops where its data does.
    return trailingAverage(pct, SMOOTH_WINDOW).map((v, k) => (pct[k] === null ? null : v));
  };
  // What each line ends on as drawn, so the legend and summary agree with the picture.
  const drawn = indexed.map(lineValues);
  const chart: ChartModel = {
    kind: 'lines',
    summary: [
      t(`${C}.summary`, { count: plotted.length, days: range, where }),
      ...(smoothed ? [t(`${C}.summarySmoothed`, { days: SMOOTH_WINDOW })] : []),
      ...plotted.map((i) =>
        t(`${C}.summaryLine`, {
          item: data.items[i]!.label,
          change: trendText(lastOf(drawn[i]!) === null ? null : lastOf(drawn[i]!)! / 100),
        })
      ),
    ].join(' '),
    ...(notes.length > 0 ? { note: notes.join(' ') } : {}),
    series: plotted.map((i, n) => {
      const end = lastOf(drawn[i]!);
      return {
        key: data.items[i]!.key,
        label: data.items[i]!.label,
        color: COLORS[n % COLORS.length]!,
        end: trendText(end === null ? null : end / 100),
        values: drawn[i]!,
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
            label: data.items[i]!.label,
            value: t(`${C}.tip`, {
              change: trendText(change),
              price: formatIskCompact(price),
              volume: formatCompactNumber(volumes[i]!.get(date) ?? 0),
            }),
            tone: signTone(change),
          },
        ];
      }),
    })),
  };
  return { ...base, chart };
};
