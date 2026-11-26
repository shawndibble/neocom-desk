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
const SMOOTH_FROM_DAYS = 30;
const SMOOTH_WINDOW = 7;
const COLORS: ChartColor[] = ['accent', 's1', 's2', 's3', 's4', 's5'];

export function trendText(change: number | null): string {
  if (change === null) return UNKNOWN;
  const pct = change * 100;
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

type TrendLine = MarketTrendSeries & { label: string };

interface ResolvedTrend {
  hubName: string;
  allGlobal: boolean;
  lines: TrendLine[];
  omitted: number;
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
    footer: notes.length > 0 ? notes.join(' ') : undefined,
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
  const smoothed = range >= SMOOTH_FROM_DAYS && plotted.length > 1;
  const lastOf = (values: (number | null)[]) => values.filter((v) => v !== null).at(-1) ?? null;
  const lineValues = (values: (number | null)[]) => {
    const pct = values.map((v) => (v === null ? null : rel(v) * 100));
    if (!smoothed) return pct;
    return trailingAverage(pct, SMOOTH_WINDOW).map((v, k) => (pct[k] === null ? null : v));
  };
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
