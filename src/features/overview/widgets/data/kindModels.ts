/**
 * Builders for the kinds that came after the old board (net worth, profit,
 * mining yield, loyalty points, best clone, wallet flow, location) and the
 * feed lists they need. Same contract as `models.ts`: pure, derived at render
 * time, the widget's range applied here over data shared by every widget of
 * the kind.
 */
import { LAYER_LABEL_KEYS } from '@/features/netWorth/layerMeta';
import { CLONE_NOTE_KEY } from '@/features/character/cloneVerdictGate';
import { journalRefTypeBreakdown } from '@/features/character/walletJournalFilter';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatCountdown, formatDuration } from '@/lib/duration';
import { formatIskCompact, formatIskCompactSigned } from '@/lib/isk';
import type { LayerId } from '@/engine/netWorth/series';
import { summarizeRouteKills, type KillLevel } from '@/engine/route/routeKillTrend';
import type { ChartColor, StackPart } from '../charts/types';
import { blank, count, NEUTRAL_NUMBER, statusOf, UNKNOWN, type Builder } from './builderKit';
import { hbarsFromRows } from './chartBuilders';
import { clonesTable, locationTable } from './characterTables';
import {
  balanceChange,
  flowDiverging,
  flowSecondary,
  flowTable,
  lpTable,
  netWorthSeries,
  netWorthTable,
} from './moneyModels';
import { journalCoverageDays, withinRange } from './chartSeries';
import type { FeedId, ListRow, NumberModel } from './types';

const D = 'overview.widgets.data';
const C = 'overview.widgets.chart';
const W = 'overview.widgets';

/** Kind -> the feeds it reads, for the kinds in this file. */
export const KIND_FEED_LISTS: Readonly<Record<string, readonly FeedId[]>> = {
  netWorth: ['netWorth'],
  profit: ['profit'],
  miningYield: ['miningYield'],
  lp: ['lp'],
  clones: ['clones'],
  walletFlow: ['journal'],
  location: ['location'],
  survey: ['survey'],
  hauling: ['hauling'],
  routeSafety: ['routeSafety'],
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

// --- Mining survey ------------------------------------------------------------------

const SURVEY_CHART_ROWS = 6;
const SURVEY_PATH = '/mining/survey';

const survey: Builder = (feeds, { t }) => {
  const feed = feeds.survey;
  const data = feed?.data ?? null;
  if (!data) return blank(SURVEY_PATH, statusOf(feed));
  const best = data.ores[0];
  const place = data.location ?? UNKNOWN;
  const note = t(`${C}.survey.note`);
  return {
    ...blank(SURVEY_PATH, statusOf(feed, { isEmpty: best === undefined })),
    emptyLinkLabel: t(`${W}.survey.emptyLink`),
    fetchedAt: data.fetchedAt,
    number: best
      ? {
          value: formatIskCompact(best.iskPerM3),
          unit: t(`${D}.survey.unit`),
          secondary: {
            text:
              data.location === null
                ? best.ore
                : t(`${D}.survey.secondary`, { ore: best.ore, place: data.location }),
          },
          tone: 'clear',
        }
      : NEUTRAL_NUMBER,
    rows: [],
    table: {
      columns: [
        { key: 'ore', label: t(`${W}.survey.col.ore`), priority: 0 },
        { key: 'location', label: t(`${W}.survey.col.location`), priority: 2 },
        { key: 'iskPerM3', label: t(`${W}.survey.col.iskPerM3`), align: 'end', priority: 1 },
      ],
      rows: data.ores.map((o) => ({
        key: o.ore,
        cells: [o.ore, place, formatIskCompact(o.iskPerM3)],
      })),
    },
    summary: note,
    chart:
      hbarsFromRows(
        t,
        data.ores.slice(0, SURVEY_CHART_ROWS).map((o) => ({
          key: o.ore,
          label: o.ore,
          value: o.iskPerM3,
          text: formatIskCompact(o.iskPerM3),
        })),
        note
      ) ?? undefined,
  };
};

// --- Hauling ------------------------------------------------------------------------

const HAULING_PATH = '/travel/hauling';

const hauling: Builder = (feeds, { t }) => {
  const feed = feeds.hauling;
  const data = feed?.data ?? null;
  if (!data) return blank(HAULING_PATH, statusOf(feed));
  const best = data.routes[0];
  const lane = (r: { from: string; to: string }) => `${r.from} → ${r.to}`;
  const perJump = (r: { profit: number; jumps: number | null }) =>
    r.jumps === null || r.jumps === 0 ? UNKNOWN : formatIskCompact(r.profit / r.jumps);
  return {
    ...blank(HAULING_PATH, statusOf(feed, { isEmpty: best === undefined })),
    emptyLinkLabel: t(`${W}.hauling.emptyLink`),
    fetchedAt: data.fetchedAt,
    number: best
      ? {
          value: formatIskCompact(best.profit),
          unit: t(`${D}.hauling.unit`),
          secondary: {
            text: t(`${D}.hauling.secondary`, {
              item: best.item,
              lane: lane(best),
              jumps: best.jumps === null ? UNKNOWN : String(best.jumps),
            }),
          },
          tone: 'clear',
        }
      : NEUTRAL_NUMBER,
    rows: [],
    table: {
      columns: [
        { key: 'route', label: t(`${W}.hauling.col.route`), priority: 0 },
        { key: 'profit', label: t(`${W}.hauling.col.profit`), align: 'end', priority: 1 },
        { key: 'jumps', label: t(`${W}.hauling.col.jumps`), align: 'end', priority: 2 },
        { key: 'perJump', label: t(`${W}.hauling.col.perJump`), align: 'end', priority: 3 },
      ],
      rows: data.routes.map((r) => ({
        key: `${r.from}>${r.to}`,
        cells: [
          lane(r),
          formatIskCompact(r.profit),
          r.jumps === null ? UNKNOWN : String(r.jumps),
          perJump(r),
        ],
      })),
    },
    summary: t(`${D}.hauling.summary`),
  };
};

// --- Best clone ---------------------------------------------------------------------

/** The nearest jump clone and how much later it would finish: the one fact "Stay put" does not carry. */
function nextBest(
  t: (key: string, options?: Record<string, unknown>) => string,
  rows: readonly { id: string | number; deltaSeconds: number | null }[]
): NumberModel['secondary'] {
  const later = rows
    .filter((row) => row.id !== 'worn' && row.deltaSeconds !== null && row.deltaSeconds > 60)
    .map((row) => row.deltaSeconds as number);
  if (later.length === 0) return undefined;
  return { text: t(`${D}.clones.nextBest`, { duration: formatCountdown(Math.min(...later)) }) };
}

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
      : {
          value: t(`${D}.clones.stay`),
          secondary: nextBest(t, data.rows),
          tone: 'clear',
        };
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
    table: clonesTable(
      t,
      data.rows.map((row) => ({
        id: row.id,
        label: labelOf(row),
        location: row.location ?? null,
        implantCount: row.implantCount ?? null,
        totalSeconds: row.totalSeconds,
        deltaSeconds: row.deltaSeconds,
      }))
    ),
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
    table: system
      ? locationTable(t, { system: systemName, security: system.security, ship: data.shipName })
      : undefined,
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

// --- Route safety -------------------------------------------------------------------

const ROUTE_SAFETY_PATH = '/travel/route';

/** Conditions, never verdicts: a busy system is one with many kills, not an unsafe one. */
const routeSafety: Builder = (feeds, { t, now }) => {
  const feed = feeds.routeSafety;
  const data = feed?.data ?? null;
  if (!data) return blank(ROUTE_SAFETY_PATH, statusOf(feed));
  const to = data.href ?? ROUTE_SAFETY_PATH;
  const trend = summarizeRouteKills(data.systems, now);
  const levelWord = (level: KillLevel) => t(`${W}.routeSafety.level.${level}`);
  const base = {
    ...blank(to, statusOf(feed, { isEmpty: !data.hasRoute })),
    emptyLinkLabel: t(`${W}.routeSafety.emptyLink`),
    fetchedAt: data.fetchedAt,
  };
  if (trend.known === 0) return base;
  const secondary = {
    text:
      trend.unknown > 0
        ? t(`${D}.routeSafety.secondaryUnread`, { count: trend.total, unread: trend.unknown })
        : t(`${D}.routeSafety.secondary`, { count: trend.total }),
  };
  const peak = Math.max(0, ...(trend.hourly ?? []));
  const unreadNote =
    trend.unknown > 0 ? ` ${t(`${C}.routeSafety.unread`, { count: trend.unknown })}` : '';
  const summary = t(`${C}.routeSafety.summary`, {
    count: trend.total,
    systems: trend.known,
    busy: trend.busy,
    peak,
    hours: (trend.hourly ?? []).join(', '),
  });
  return {
    ...base,
    number: {
      value: count(trend.busy),
      unit: t(`${D}.routeSafety.unit`, { count: trend.busy }),
      secondary,
      tone: 'clear',
    },
    rows: [],
    table: {
      columns: [
        { key: 'system', label: t(`${W}.routeSafety.col.system`), priority: 0 },
        { key: 'kills', label: t(`${W}.routeSafety.col.kills`), align: 'end', priority: 1 },
        { key: 'level', label: t(`${W}.routeSafety.col.level`), priority: 2 },
      ],
      rows: trend.rows.map((row) => ({
        key: String(row.systemId),
        cells: [
          row.name,
          row.count === null ? UNKNOWN : count(row.count),
          row.level === null
            ? UNKNOWN
            : row.level === 'busy'
              ? { text: levelWord(row.level), tone: 'caution' }
              : levelWord(row.level),
        ],
      })),
    },
    summary: `${summary}${unreadNote}`,
    chart:
      trend.hourly && trend.total > 0
        ? {
            kind: 'bars',
            values: trend.hourly,
            max: t(`${C}.routeSafety.max`, { count: peak }),
            xStart: t(`${C}.routeSafety.xStart`),
            xEnd: t(`${C}.routeSafety.xEnd`),
            note: t(`${C}.routeSafety.note`),
            summary: `${summary}${unreadNote}`,
          }
        : undefined,
  };
};

export const KIND_BUILDERS: Readonly<Record<string, Builder>> = {
  walletFlow,
  netWorth,
  lp,
  clones,
  location,
  survey,
  hauling,
  routeSafety,
};
