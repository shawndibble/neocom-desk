/**
 * Builders for the kinds that came after the old board (net worth, profit,
 * mining yield, loyalty points, best clone, wallet flow, location) and the
 * feed lists they need. Same contract as `models.ts`: pure, derived at render
 * time, the widget's range applied here over data shared by every widget of
 * the kind.
 */
import { filterYieldRange, eveToday, rangeDates, daysCovered } from '@/engine/miningTax/yieldRange';
import type { MiningYieldRange } from '@/engine/miningTax/yieldRange';
import { LAYER_LABEL_KEYS } from '@/features/netWorth/layerMeta';
import { CLONE_NOTE_KEY } from '@/features/character/cloneVerdictGate';
import { journalRefTypeBreakdown } from '@/features/character/walletJournalFilter';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatDuration } from '@/lib/duration';
import { formatIskCompact, formatIskCompactSigned } from '@/lib/isk';
import type { LayerId } from '@/engine/netWorth/series';
import type { ChartColor, StackPart } from '../charts/types';
import { blank, NEUTRAL_NUMBER, statusOf, UNKNOWN, type Builder } from './builderKit';
import { hbarsFromRows } from './chartBuilders';
import {
  balanceChange,
  flowDiverging,
  flowSecondary,
  flowTable,
  lpTable,
  netWorthSeries,
  netWorthTable,
} from './moneyModels';
import { backwardBucketSums, journalCoverageDays, withinRange } from './chartSeries';
import type { FeedId, ListRow, NumberModel } from './types';

const DAY_MS = 86_400_000;
const D = 'overview.widgets.data';
const C = 'overview.widgets.chart';

/** Kind -> the feeds it reads, for the kinds in this file. */
export const KIND_FEED_LISTS: Readonly<Record<string, readonly FeedId[]>> = {
  netWorth: ['netWorth'],
  profit: ['profit'],
  miningYield: ['miningYield'],
  lp: ['lp'],
  clones: ['clones'],
  walletFlow: ['journal'],
  location: ['location'],
};

/** Where each net worth layer sits in the bar and which series hue it keeps (the Net Worth page's). */
const NET_WORTH_BAR: readonly { id: LayerId; color: ChartColor }[] = [
  { id: 'assets', color: 's1' },
  { id: 'sellOrders', color: 's4' },
  { id: 'escrow', color: 's2' },
  { id: 'isk', color: 's3' },
];

/** `bounty_prize` -> `Bounty prize`: ESI's ref types have no display names of their own. */
export function humanizeRefType(refType: string): string {
  const spaced = refType.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// --- Wallet flow ----------------------------------------------------------------

const walletFlow: Builder = (feeds, { t, now, range }) => {
  const feed = feeds.journal;
  const data = feed?.data ?? null;
  const to = '/wallet';
  if (!data) return blank(to, statusOf(feed));
  const all = data.result?.data ?? [];
  const entries = withinRange(all, now, range);
  const flow = journalRefTypeBreakdown(entries);
  const covered = journalCoverageDays(all, now);
  // ESI keeps about 30 days: a 90-day range must say how much it really covers.
  const note =
    covered > 0 && covered < range
      ? t(`${C}.walletFlow.noteCovered`, { count: range, covered })
      : t(`${C}.walletFlow.note`, { count: range });
  const income = formatIskCompact(flow.totalIn);
  const spending = formatIskCompact(flow.totalOut);
  const summary = t(`${C}.walletFlow.summary`, {
    income,
    spending,
    net: formatIskCompactSigned(flow.net),
    count: range,
  });
  return {
    ...blank(
      to,
      statusOf(feed, { needsPermission: data.needsReauth, isEmpty: entries.length === 0 })
    ),
    fetchedAt: data.result?.fetchedAt ?? null,
    fromCache: data.result?.fromCache ?? false,
    number: {
      value: formatIskCompactSigned(flow.net),
      iskAmount: flow.net,
      unit: t('overview.isk'),
      // Income and spending are the chart's and the table's: the line says how the net moved.
      secondary: flowSecondary(t, all, now, range, covered, flow.rows),
      tone: 'clear',
    },
    rows: [],
    table: flowTable(t, flow.rows),
    summary,
    chart: flowDiverging(t, entries, now, range, note, summary) ?? undefined,
  };
};

// --- Net worth ------------------------------------------------------------------

const netWorth: Builder = (feeds, { t, activeCharacterId, scopeAll }) => {
  const feed = feeds.netWorth;
  const data = feed?.data ?? null;
  const to = '/wallet';
  if (!data) return blank(to, statusOf(feed));
  const everyone = scopeAll || activeCharacterId === null;
  const scoped = data.characters.filter((c) => everyone || c.characterId === activeCharacterId);
  const included = scoped.filter((c) => c.covered);
  // A Character with a snapshot but no longer holding every permission: ask for it, do not sum it.
  if (included.length === 0) {
    return {
      ...blank(
        to,
        statusOf(feed, { needsPermission: scoped.length > 0, isEmpty: scoped.length === 0 })
      ),
      summary: t(`${D}.netWorth.none`),
    };
  }
  const layers: Record<LayerId, number> = { isk: 0, assets: 0, escrow: 0, sellOrders: 0 };
  for (const character of included) {
    for (const id of Object.keys(layers) as LayerId[]) layers[id] += character.layers[id];
  }
  const total = layers.isk + layers.assets + layers.escrow + layers.sellOrders;
  const day = included.reduce((latest, c) => (c.day > latest ? c.day : latest), '');
  // ISK and assets are always layers; the rest only when something is in them.
  const shown = NET_WORTH_BAR.filter(
    ({ id }) => id === 'isk' || id === 'assets' || layers[id] !== 0
  );
  const parts: StackPart[] = shown.map(({ id, color }) => ({
    key: id,
    label: t(LAYER_LABEL_KEYS[id]),
    value: Math.max(0, layers[id]),
    text: formatIskCompact(layers[id]),
    color,
  }));
  const summary = t(`${C}.netWorth.summary`, {
    total: formatIskCompact(total),
    parts: parts.map((p) => `${p.label} ${p.text}`).join(', '),
  });
  const series = netWorthSeries(included);
  const note = t(`${C}.netWorth.note`, { day });
  return {
    ...blank(to, statusOf(feed)),
    fetchedAt: new Date(Date.parse(day)),
    fromCache: true,
    number: {
      value: formatIskCompact(total),
      iskAmount: total,
      unit: t('overview.isk'),
      // How far it moved over the recorded days; "as of" is the chart's caption.
      secondary: balanceChange(t, series.totals, 'overview.widgets.netWorth'),
      tone: 'clear',
    },
    rows: [],
    table: netWorthTable(
      t,
      layers,
      series,
      shown.map(({ id }) => id)
    ),
    summary,
    chart:
      series.days.length >= 2
        ? {
            kind: 'stackedArea',
            layers: shown.map(({ id, color }) => ({
              key: id,
              values: series.layers[id],
              color,
            })),
            parts,
            max: t(`${C}.max`, { value: formatIskCompact(Math.max(...series.totals)) }),
            xStart: t(`${C}.daysAgo`, { count: series.days.length }),
            xEnd: t(`${C}.today`),
            note,
            summary,
          }
        : { kind: 'stack', parts, note, summary },
  };
};

// --- Realized profit --------------------------------------------------------------

const profit: Builder = (feeds, { t, now, range }) => {
  const feed = feeds.profit;
  const data = feed?.data ?? null;
  const to = '/industry';
  if (!data) return blank(to, statusOf(feed));
  const inRange = data.runs.filter(
    (run) => run.loggedAt >= now - range * DAY_MS && run.loggedAt <= now
  );
  const total = inRange.reduce((sum, run) => sum + run.profit, 0);
  // A week is the unit the spec asks for; a 7-day range has too few weeks to be a chart, so days.
  const daily = range <= 7;
  const bucketMs = daily ? DAY_MS : 7 * DAY_MS;
  const buckets = daily ? range : Math.ceil(range / 7);
  const values = backwardBucketSums(
    data.runs,
    (run) => run.loggedAt,
    (run) => run.profit,
    now,
    bucketMs,
    buckets
  );
  const byProduct = new Map<number, { profit: number; built: number }>();
  for (const run of inRange) {
    const row = byProduct.get(run.productTypeID) ?? { profit: 0, built: 0 };
    row.profit += run.profit;
    row.built += run.quantity;
    byProduct.set(run.productTypeID, row);
  }
  const rows: ListRow[] = [...byProduct.entries()]
    .sort((a, b) => b[1].profit - a[1].profit)
    .map(([typeId, row]) => ({
      key: String(typeId),
      title: data.names.get(typeId) ?? `#${typeId}`,
      detail: t(`${D}.profit.built`, { count: row.built }),
      value: formatIskCompactSigned(row.profit),
      iskAmount: row.profit,
      tone: 'clear',
    }));
  const summary = t(`${C}.profit.summary`, {
    total: formatIskCompactSigned(total),
    runs: inRange.length,
    range,
    buckets: values.map((v) => formatIskCompactSigned(v)).join(', '),
  });
  return {
    ...blank(to, statusOf(feed, { isEmpty: data.runs.length === 0 })),
    number: {
      value: formatIskCompactSigned(total),
      iskAmount: total,
      unit: t('overview.isk'),
      tone: 'clear',
    },
    rows,
    summary,
    chart:
      inRange.length === 0
        ? undefined
        : {
            kind: 'bars',
            values,
            max: t(`${C}.max`, { value: formatIskCompact(Math.max(0, ...values)) }),
            xStart: t(daily ? `${C}.daysAgo` : `${C}.weeksAgo`, { count: buckets }),
            xEnd: t(daily ? `${C}.today` : `${C}.thisWeek`),
            note: t(daily ? `${C}.profit.noteDaily` : `${C}.profit.noteWeekly`),
            summary,
          },
  };
};

// --- Mining yield -----------------------------------------------------------------

const miningYield: Builder = (feeds, { t, now, range, scopeAll, activeCharacterId }) => {
  const feed = feeds.miningYield;
  const data = feed?.data ?? null;
  const to = '/mining';
  if (!data) return blank(to, statusOf(feed));
  const everyone = scopeAll || activeCharacterId === null;
  const rows = data.rows.filter((row) => everyone || row.characterId === activeCharacterId);
  const needsPermission = everyone
    ? data.trackedIds.length > 0 && data.reauthIds.length === data.trackedIds.length
    : activeCharacterId !== null &&
      (data.reauthIds.includes(activeCharacterId) || !data.trackedIds.includes(activeCharacterId));
  const window = `${range}d` as MiningYieldRange;
  const today = eveToday(new Date(now));
  const inRange = filterYieldRange(rows, window, today);
  const perDay = new Map<string, number>();
  const perOre = new Map<number, number>();
  for (const row of inRange) {
    perDay.set(row.date, (perDay.get(row.date) ?? 0) + row.isk);
    for (const ore of row.ores) perOre.set(ore.typeId, (perOre.get(ore.typeId) ?? 0) + ore.isk);
  }
  const values = rangeDates(window, today).map((date) => perDay.get(date) ?? 0);
  const total = values.reduce((sum, v) => sum + v, 0);
  const average = total / range;
  const covered = daysCovered(
    inRange.map((row) => row.date),
    window,
    today,
    data.oldestSaved
  );
  const oreTotal = [...perOre.values()].reduce((sum, v) => sum + v, 0);
  const oreRows: ListRow[] = [...perOre.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([typeId, isk]) => ({
      key: String(typeId),
      title: data.typeNames.get(typeId) ?? `#${typeId}`,
      detail:
        oreTotal > 0
          ? t(`${D}.miningYield.share`, { pct: Math.round((isk / oreTotal) * 100) })
          : undefined,
      value: formatIskCompact(isk),
      iskAmount: isk,
      tone: 'clear',
    }));
  const summary = t(`${C}.miningYield.summary`, {
    average: formatIskCompact(average),
    days: covered.daysWithData,
    range,
    total: formatIskCompact(total),
  });
  return {
    ...blank(
      to,
      statusOf(feed, { needsPermission, isEmpty: !needsPermission && rows.length === 0 })
    ),
    fetchedAt: data.fetchedAt,
    number: {
      value: formatIskCompact(average),
      iskAmount: average,
      unit: t(`${D}.miningYield.unit`),
      // The headline is the average; the best day is the fact it lacks. The history caveat lives in the chart caption.
      secondary:
        Math.max(...values) > 0
          ? {
              text: t(`${D}.miningYield.bestDay`, { value: formatIskCompact(Math.max(...values)) }),
            }
          : undefined,
      tone: 'clear',
    },
    rows: oreRows,
    summary,
    chart:
      total <= 0
        ? undefined
        : {
            kind: 'bars',
            values,
            max: t(`${C}.max`, { value: formatIskCompact(Math.max(...values)) }),
            xStart: t(`${C}.daysAgo`, { count: range }),
            xEnd: t(`${C}.today`),
            note:
              covered.historyStartsInRange !== null
                ? t(`${C}.miningYield.noteSince`, { date: covered.historyStartsInRange })
                : t(`${C}.miningYield.note`),
            summary,
          },
  };
};

// --- Loyalty points -----------------------------------------------------------------

const LP_CHART_ROWS = 6;

const lp: Builder = (feeds, { t }) => {
  const feed = feeds.lp;
  const data = feed?.data ?? null;
  const to = '/wallet';
  if (!data) return blank(to, statusOf(feed));
  const total = data.entries.reduce((sum, entry) => sum + entry.points, 0);
  const nameOf = (entry: (typeof data.entries)[number]) =>
    entry.name ?? t(`${D}.lp.corporation`, { id: entry.corporationId });
  const largest = data.entries.reduce<(typeof data.entries)[number] | null>(
    (top, entry) => (top === null || entry.points > top.points ? entry : top),
    null
  );
  const note = t(`${D}.lp.corporations`, { count: data.entries.length });
  return {
    ...blank(
      to,
      statusOf(feed, { needsPermission: data.needsReauth, isEmpty: data.entries.length === 0 })
    ),
    fetchedAt: data.fetchedAt,
    number: {
      value: formatCompactNumber(total),
      unit: t(`${D}.lp.unit`),
      // One corporation is the whole total: naming it would restate the headline.
      secondary:
        largest && data.entries.length > 1
          ? {
              text: t(`${D}.lp.largest`, {
                name: nameOf(largest),
                value: formatCompactNumber(largest.points),
              }),
            }
          : undefined,
      tone: 'clear',
    },
    rows: [],
    table: lpTable(t, data.entries),
    summary: note,
    chart:
      hbarsFromRows(
        t,
        data.entries.slice(0, LP_CHART_ROWS).map((entry) => ({
          key: String(entry.corporationId),
          label: nameOf(entry),
          value: entry.points,
          text: formatCompactNumber(entry.points),
        })),
        t(`${C}.lp.note`)
      ) ?? undefined,
  };
};

// --- Best clone ---------------------------------------------------------------------

const clones: Builder = (feeds, { t }) => {
  const feed = feeds.clones;
  const data = feed?.data ?? null;
  const to = '/clones';
  if (!data) return blank(to, statusOf(feed));
  const base = {
    ...blank(
      to,
      statusOf(feed, {
        needsPermission: data.needsReauth,
        isEmpty: !data.needsReauth && data.cloneCount === 0,
      })
    ),
    fetchedAt: data.fetchedAt,
  };
  if (data.note !== null) {
    const note = t(`clones.verdict.note${CLONE_NOTE_KEY[data.note]}`);
    return {
      ...base,
      number: { value: UNKNOWN, secondary: { text: note }, tone: 'clear' },
      summary: note,
    };
  }
  const labelOf = (row: (typeof data.rows)[number]) =>
    row.label ??
    (row.id === 'worn'
      ? t(`${D}.clones.current`)
      : t(`${D}.clones.cloneId`, { id: String(row.id) }));
  const best = data.rows.find((row) => row.id === data.bestId);
  const bestLabel = best ? labelOf(best) : UNKNOWN;
  // "Stay put" is the whole answer; only a jump has a saving worth a second line.
  const number: NumberModel =
    data.verdict === 'jump' && data.savedSeconds !== null
      ? {
          value: bestLabel,
          secondary: {
            text: t(`${D}.clones.sooner`, { duration: formatDuration(data.savedSeconds) }),
            direction: 'down',
            tone: 'good',
          },
          tone: 'clear',
        }
      : { value: t(`${D}.clones.stay`), tone: 'clear' };
  const rows: ListRow[] = data.rows.map((row) => {
    const delta = row.deltaSeconds;
    return {
      key: String(row.id),
      title: labelOf(row),
      detail: row.id === data.bestId ? t(`${D}.clones.best`) : undefined,
      value:
        delta === null
          ? UNKNOWN
          : Math.abs(delta) < 60
            ? t(`${D}.clones.baseline`)
            : t(delta < 0 ? `${D}.clones.soonerBy` : `${D}.clones.laterBy`, {
                duration: formatDuration(Math.abs(delta)),
              }),
      tone: 'clear',
    };
  });
  return {
    ...base,
    number,
    rows,
    summary: [number.value, number.secondary?.text].filter(Boolean).join('. '),
  };
};

// --- Location and ship ----------------------------------------------------------------

const location: Builder = (feeds, { t }) => {
  const feed = feeds.location;
  const data = feed?.data ?? null;
  const to = '/travel';
  if (!data) return blank(to, statusOf(feed));
  const system = data.system;
  const systemName = system
    ? (system.name ?? t(`${D}.location.systemId`, { id: system.id }))
    : UNKNOWN;
  const security =
    system?.security === null || system?.security === undefined
      ? undefined
      : t(`${D}.location.security`, { value: system.security.toFixed(1) });
  const rows: ListRow[] = system
    ? [
        {
          key: 'system',
          title: t(`${D}.location.system`),
          detail: security,
          value: systemName,
          tone: 'clear',
        },
        {
          key: 'ship',
          title: t(`${D}.location.ship`),
          value: data.shipName ?? UNKNOWN,
          tone: 'clear',
        },
      ]
    : [];
  return {
    ...blank(
      to,
      statusOf(feed, {
        needsPermission: data.needsReauth,
        isEmpty: !data.needsReauth && system === null,
      })
    ),
    number: system
      ? {
          value: systemName,
          unit: security,
          secondary: data.shipName ? { text: data.shipName } : undefined,
          tone: 'clear',
        }
      : NEUTRAL_NUMBER,
    rows,
    summary: [systemName, data.shipName].filter(Boolean).join(', '),
  };
};

export const KIND_BUILDERS: Readonly<Record<string, Builder>> = {
  walletFlow,
  netWorth,
  profit,
  miningYield,
  lp,
  clones,
  location,
};
