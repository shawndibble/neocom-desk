/**
 * Builders for the space and ledger kinds: incursions, realized profit and
 * mining yield. Same contract as `models.ts`: pure, derived at render time.
 * Each builds its own Table (real columns, priorities as `tableModel.ts`
 * reads them), a Number that is a headline plus one fact the headline lacks,
 * and a chart that names what it draws.
 */
import { DAY_MS } from '@/lib/age';
import { eveClock } from '@/lib/eveTime';
import { utcDay } from '@/engine/localDay';
import type { DeadlineSeverity } from '@/engine/character/severity';
import { filterYieldRange, eveToday, rangeDates, daysCovered } from '@/engine/miningTax/yieldRange';
import type { MiningYieldRange } from '@/engine/miningTax/yieldRange';
import { routeToHref } from '@/features/route/routeSafetyLink';
import { formatIskCompact, formatIskCompactSigned } from '@/lib/isk';
import { formatCompactNumber } from '@/lib/compactNumber';
import {
  incursionJumpsWhen,
  incursionsSeverity,
  incursionsSummary,
} from '../../data/incursionsBoard';
import type { IncursionsBoardData } from '../../data/incursionsBoard';
import type { ProfitWidgetData } from './kindLoaders';
import { blank, count, statusOf, UNKNOWN, type Builder, type KindDef } from './builderKit';
import { fractionBar, signedCell } from './cellKit';
import { backwardBucketSums } from './chartSeries';
import { profitBuckets, type SourceProfit } from './profitCombine';
import { dayTitle, rollingTitles, signTone } from './chartTips';
import type {
  NumberModel,
  NumberSecondary,
  TableCell,
  TableColumn,
  TableModel,
  Translate,
} from './types';
import { industry } from './industryModels';
import { mercenaryDens } from './mercenaryDensModels';
import { planetary } from './planetaryModels';
import { moonChunks, structures } from './structureModels';

const C = 'overview.widgets.chart';
const D = 'overview.widgets.data';

const iskCell = (isk: number, text = formatIskCompactSigned(isk)): TableCell => ({
  text,
  iskAmount: isk,
});

// --- Incursions -------------------------------------------------------------------

function incursionSystem(t: Translate, data: IncursionsBoardData, id: number): string {
  return data.systemNames.get(id) ?? t('travel.stops.unnamed', { id });
}

export const incursions: Builder = (feeds, { t }) => {
  const feed = feeds.incursions;
  const data = feed?.data ?? null;
  const to = '/travel/route';
  if (!data) return blank(to, statusOf(feed));
  const nearest = data.rows[0];
  const tone = incursionsSeverity(data) ?? 'clear';
  // Jumps to the nearest is the question; with no origin to count from, the active count is all there is.
  const number: NumberModel =
    nearest && nearest.jumps !== null
      ? {
          value: count(nearest.jumps),
          unit: t('overview.widgets.incursions.jumpsAway', { count: nearest.jumps }),
          secondary: {
            text: t('overview.widgets.incursions.nearestActive', {
              system: incursionSystem(t, data, nearest.stagingSystemId),
              count: data.rows.length,
            }),
          },
          tone,
        }
      : {
          value: count(data.rows.length),
          unit: t('overview.widgets.incursions.unit'),
          tone,
        };

  const table: TableModel = {
    columns: [
      { key: 'system', label: t('overview.widgets.incursions.col.system'), priority: 0 },
      {
        key: 'jumps',
        label: t('overview.widgets.incursions.col.jumps'),
        align: 'end',
        priority: 1,
      },
      { key: 'state', label: t('overview.widgets.incursions.col.state'), priority: 2 },
      {
        key: 'influence',
        label: t('overview.widgets.incursions.col.influence'),
        align: 'end',
        priority: 3,
        hideNarrow: true,
      },
      {
        key: 'constellation',
        label: t('overview.widgets.incursions.col.constellation'),
        priority: 4,
        hideNarrow: true,
      },
    ],
    rows: data.rows.map((row) => {
      const state = t(`travel.incursions.state.${row.state}`);
      return {
        key: String(row.constellationId),
        cells: [
          incursionSystem(t, data, row.stagingSystemId),
          incursionJumpsWhen(t, row, data.jumpsStatus),
          row.hasBoss ? t('overview.widgets.incursions.withBoss', { state }) : state,
          `${Math.round(row.influence * 100)}%`,
          data.constellationNames.get(row.constellationId) ??
            t('travel.incursions.constellation', { id: row.constellationId }),
        ],
        tone: 'clear' as DeadlineSeverity,
        to: routeToHref(row.stagingSystemId),
      };
    }),
  };

  return {
    ...blank(to, statusOf(feed)),
    number,
    rows: data.rows.map((row) => {
      const constellation =
        data.constellationNames.get(row.constellationId) ??
        t('travel.incursions.constellation', { id: row.constellationId });
      return {
        key: String(row.constellationId),
        title: incursionSystem(t, data, row.stagingSystemId),
        detail: t('overview.board.incursionsDetailLabel', {
          state: t(`travel.incursions.state.${row.state}`),
          constellation,
        }),
        value: incursionJumpsWhen(t, row, data.jumpsStatus),
        tone: 'clear' as DeadlineSeverity,
        to: routeToHref(row.stagingSystemId),
      };
    }),
    table,
    summary: incursionsSummary(t, data),
  };
};

// --- Realized profit --------------------------------------------------------------

/** "+12M vs the previous 30 days": a Profit window against the one before it. */
export function vsPrevious(t: Translate, delta: number, range: number): NumberSecondary {
  return {
    text: t('overview.widgets.profit.vsPrevious', {
      delta: formatIskCompactSigned(delta),
      count: range,
    }),
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    tone: delta > 0 ? 'good' : delta < 0 ? 'bad' : undefined,
  };
}

/** The logged runs in the window, the window before it and each product's line, as both Profit sources read them. */
function readBuilds(data: ProfitWidgetData, now: number, range: number) {
  const inRange = data.runs.filter(
    (run) => run.loggedAt >= now - range * DAY_MS && run.loggedAt <= now
  );
  const previous = data.runs.filter(
    (run) => run.loggedAt >= now - 2 * range * DAY_MS && run.loggedAt < now - range * DAY_MS
  );
  const total = inRange.reduce((sum, run) => sum + run.profit, 0);
  const byProduct = new Map<number, { profit: number; built: number }>();
  for (const run of inRange) {
    const row = byProduct.get(run.productTypeID) ?? { profit: 0, built: 0 };
    row.profit += run.profit;
    row.built += run.quantity;
    byProduct.set(run.productTypeID, row);
  }
  const products = [...byProduct.entries()].sort((a, b) => b[1].profit - a[1].profit);
  const nameOf = (typeId: number) => data.names.get(typeId) ?? `#${typeId}`;
  return { inRange, previous, total, products, nameOf };
}

/** The Builds side of Profit on Both; no earlier runs is no window before. */
export function buildsSource(data: ProfitWidgetData, now: number, range: number): SourceProfit {
  const { previous, total, products, nameOf } = readBuilds(data, now, range);
  return {
    total,
    previous: previous.length > 0 ? previous.reduce((sum, run) => sum + run.profit, 0) : null,
    points: data.runs.map((run) => ({ at: run.loggedAt, profit: run.profit })),
    rows: products.map(([typeId, row]) => ({
      key: String(typeId),
      name: nameOf(typeId),
      profit: row.profit,
    })),
  };
}

/** Profit on Builds: what the logged industry runs made. */
export const buildProfit: Builder = (feeds, { t, now, range }) => {
  const feed = feeds.profit;
  const data = feed?.data ?? null;
  const to = '/industry';
  if (!data) return blank(to, statusOf(feed));
  const { inRange, previous, total, products, nameOf } = readBuilds(data, now, range);
  const { daily, bucketMs, buckets } = profitBuckets(range);
  const values = backwardBucketSums(
    data.runs,
    (run) => run.loggedAt,
    (run) => run.profit,
    now,
    bucketMs,
    buckets
  );

  // The headline is the window's total; against the window before it is the fact it lacks. No earlier runs, no claim.
  const secondary =
    previous.length > 0
      ? vsPrevious(t, total - previous.reduce((sum, run) => sum + run.profit, 0), range)
      : undefined;

  const table: TableModel = {
    columns: [
      { key: 'product', label: t('overview.widgets.profit.col.product'), priority: 0 },
      { key: 'profit', label: t('overview.widgets.profit.col.profit'), align: 'end', priority: 1 },
      { key: 'built', label: t('overview.widgets.profit.col.built'), align: 'end', priority: 2 },
      {
        key: 'perUnit',
        label: t('overview.widgets.profit.col.perUnit'),
        align: 'end',
        priority: 3,
      },
    ],
    rows: products.map(([typeId, row]) => ({
      key: String(typeId),
      cells: [
        nameOf(typeId),
        iskCell(row.profit),
        formatCompactNumber(row.built),
        row.built > 0
          ? signedCell(formatIskCompactSigned(row.profit / row.built), row.profit)
          : UNKNOWN,
      ],
      tone: row.profit < 0 ? 'watch' : 'clear',
    })),
  };

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
      secondary,
      tone: 'clear',
    },
    rows: products.map(([typeId, row]) => ({
      key: String(typeId),
      title: nameOf(typeId),
      detail: t(`${D}.profit.built`, { count: row.built }),
      value: formatIskCompactSigned(row.profit),
      iskAmount: row.profit,
      tone: 'clear' as DeadlineSeverity,
    })),
    table,
    summary,
    chart:
      inRange.length === 0
        ? undefined
        : {
            kind: 'bars',
            values,
            max: t(`${C}.max`, { value: formatIskCompact(Math.max(0, ...values)) }),
            gains: true,
            barLabels: values.map((v) => (v === 0 ? '' : formatIskCompactSigned(v))),
            xStart: t(daily ? `${C}.daysAgo` : `${C}.weeksAgo`, { count: buckets }),
            xEnd: t(daily ? `${C}.today` : `${C}.thisWeek`),
            tips: rollingTitles(t, daily ? 'day' : 'week', buckets).map((title, i) => ({
              title,
              rows: [
                {
                  label: t(`${C}.tip.profit`),
                  value: formatIskCompactSigned(values[i]!),
                  tone: signTone(values[i]!),
                },
              ],
            })),
            note: t(daily ? `${C}.profit.noteDaily` : `${C}.profit.noteWeekly`),
            summary,
          },
  };
};

// --- Mining yield -----------------------------------------------------------------

export const miningYield: Builder = (feeds, { t, now, range, scopeAll, activeCharacterId }) => {
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
  const perOre = new Map<number, { isk: number; units: number | null }>();
  for (const row of inRange) {
    perDay.set(row.date, (perDay.get(row.date) ?? 0) + row.isk);
    for (const ore of row.ores) {
      const entry = perOre.get(ore.typeId) ?? { isk: 0, units: 0 };
      entry.isk += ore.isk;
      entry.units =
        ore.units === undefined || entry.units === null ? null : entry.units + ore.units;
      perOre.set(ore.typeId, entry);
    }
  }
  const values = rangeDates(window, today).map((date) => perDay.get(date) ?? 0);
  const total = values.reduce((sum, v) => sum + v, 0);
  const average = total / range;
  const best = Math.max(...values);
  const covered = daysCovered(
    inRange.map((row) => row.date),
    window,
    today,
    data.oldestSaved
  );
  const oreTotal = [...perOre.values()].reduce((sum, v) => sum + v.isk, 0);
  const ores = [...perOre.entries()].sort((a, b) => b[1].isk - a[1].isk);
  const nameOf = (typeId: number) => data.typeNames.get(typeId) ?? `#${typeId}`;
  const sharePct = (isk: number) => Math.round((isk / oreTotal) * 100);
  const showUnits = ores.some(([, ore]) => ore.units !== null);

  const columns: TableColumn[] = [
    { key: 'ore', label: t('overview.widgets.miningYield.col.ore'), priority: 0 },
    { key: 'isk', label: t('overview.widgets.miningYield.col.isk'), align: 'end', priority: 1 },
    { key: 'share', label: t('overview.widgets.miningYield.col.share'), align: 'end', priority: 2 },
  ];
  if (showUnits) {
    columns.push({
      key: 'units',
      label: t('overview.widgets.miningYield.col.units'),
      align: 'end',
      priority: 3,
    });
  }
  const table: TableModel = {
    columns,
    rows: ores.map(([typeId, ore]) => {
      const cells: TableCell[] = [
        nameOf(typeId),
        iskCell(ore.isk, formatIskCompact(ore.isk)),
        oreTotal > 0
          ? { text: `${sharePct(ore.isk)}%`, bar: fractionBar(ore.isk, oreTotal) }
          : UNKNOWN,
      ];
      if (showUnits) cells.push(ore.units === null ? UNKNOWN : formatCompactNumber(ore.units));
      return { key: String(typeId), cells, tone: 'clear' as DeadlineSeverity, info: { typeId } };
    }),
  };

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
        best > 0
          ? { text: t(`${D}.miningYield.bestDay`, { value: formatIskCompact(best) }) }
          : undefined,
      tone: 'clear',
    },
    rows: ores.map(([typeId, ore]) => ({
      key: String(typeId),
      title: nameOf(typeId),
      detail: oreTotal > 0 ? t(`${D}.miningYield.share`, { pct: sharePct(ore.isk) }) : undefined,
      value: formatIskCompact(ore.isk),
      iskAmount: ore.isk,
      tone: 'clear' as DeadlineSeverity,
    })),
    table,
    summary,
    chart:
      total <= 0
        ? undefined
        : {
            kind: 'bars',
            values,
            max: t(`${C}.max`, { value: formatIskCompact(best) }),
            xStart: t(`${C}.daysAgo`, { count: range }),
            xEnd: t(`${C}.today`),
            tips: rangeDates(window, today).map((date, i) => ({
              title: dayTitle(date),
              rows: [{ label: t(`${C}.tip.mined`), value: formatIskCompact(values[i]!) }],
            })),
            ref: {
              value: average,
              label: t(`${C}.miningYield.average`, { value: formatIskCompact(average) }),
            },
            note:
              covered.historyStartsInRange !== null
                ? t(`${C}.miningYield.noteSince`, { date: covered.historyStartsInRange })
                : t(`${C}.miningYield.note`),
            summary,
          },
  };
};

// --- Skyhook raids ---------------------------------------------------------------

/** Stand-in until the registry loads `sovRaidsModel.ts` (`loadBuild`): loading even over a restored snapshot; a failed read still shows failed. */
const sovRaidsPending: Builder = (feeds) =>
  blank(
    '/travel/route',
    statusOf(feeds.sovRaids, { loading: !feeds.sovRaids?.error, hasData: false })
  );

/** The game clock: UTC, read from the ticking `now`, so no feed and nothing to wait for. */
export const eveTime: Builder = (_feeds, { t, now }) => ({
  ...blank(null, {
    hasStaleData: false,
    loading: false,
    needsPermission: false,
    error: false,
    hasData: true,
    isEmpty: false,
  }),
  number: {
    value: eveClock(now),
    unit: t('overview.widgets.eveTime.unit'),
    secondary: { text: utcDay(now) },
    tone: 'clear',
  },
  summary: t('overview.widgets.eveTime.summary', { time: eveClock(now) }),
});

/** The kinds built in this file and its siblings, each with the feeds it reads. */
export const WORLD_DEFS: Readonly<Record<string, KindDef>> = {
  eveTime: { feeds: [], scope: 'character', build: eveTime },
  industry: { feeds: ['industry'], scope: 'account', build: industry },
  planetary: { feeds: ['planetary'], scope: 'character', build: planetary },
  mercenaryDens: { feeds: ['mercenaryDens'], scope: 'account', build: mercenaryDens },
  structures: { feeds: ['structures'], scope: 'character', build: structures },
  moonChunks: { feeds: ['moonChunks'], scope: 'character', build: moonChunks },
  incursions: { feeds: ['incursions'], scope: 'account', build: incursions },
  sovRaids: {
    feeds: ['sovRaids'],
    scope: 'character',
    build: sovRaidsPending,
    loadBuild: () => import('./sovRaidsModel').then((m) => m.sovRaids),
  },
  miningYield: { feeds: ['miningYield'], scope: 'account', build: miningYield },
};
