/**
 * Builders for the kinds that came after the old board (net worth, profit,
 * mining yield, loyalty points, best clone, wallet flow, location) and the
 * feed lists they need. Same contract as `models.ts`: pure, derived at render
 * time, the widget's range applied here over data shared by every widget of
 * the kind.
 */
import { fixed1 } from '@/lib/fixedFormat';
import { LAYER_LABEL_KEYS } from '@/features/netWorth/layerMeta';
import { CLONE_NOTE_KEY } from '@/features/character/cloneVerdictGate';
import { journalRefTypeBreakdown } from '@/features/character/walletJournalFilter';
import { formatEveClock } from '@/engine/survey/chatMessage';
import { formatCompactNumber } from '@/lib/compactNumber';
import { eveToday, rangeDates, type MiningYieldRange } from '@/engine/miningTax/yieldRange';
import { longestRemainingSeconds, secondsLeft } from '@/engine/clone/jumpTimers';
import { formatCountdown, formatDuration } from '@/lib/duration';
import { formatIskCompact, formatIskCompactSigned } from '@/lib/isk';
import type { LayerId } from '@/engine/netWorth/series';
import { summarizeRouteKills, type KillLevel } from '@/engine/route/routeKillTrend';
import type { ChartColor, StackPart } from '../charts/types';
import {
  blank,
  count,
  NEUTRAL_NUMBER,
  statusOf,
  UNKNOWN,
  type Builder,
  type KindDef,
} from './builderKit';
import { omega } from './omegaModel';
import { tradingProfit } from './tradingProfitModel';
import { hbarsFromRows } from './chartBuilders';
import { clonesTable, locationTable } from './characterTables';
import {
  balanceChange,
  flowBars,
  flowSecondary,
  flowTable,
  lpTable,
  netWorthSeries,
  netWorthTable,
} from './moneyModels';
import { journalCoverageDays, withinRange } from './chartSeries';
import { dayTitle, rollingTitles } from './chartTips';
import type { ListRow, NumberModel, TableCell } from './types';

const D = 'overview.widgets.data';
const C = 'overview.widgets.chart';
const W = 'overview.widgets';

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
    chart: flowBars(t, entries, now, range, note, summary) ?? undefined,
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
    // Recorded daily snapshots are history, not a cached read of a live feed: `true`
    // here made the header's "Showing cached data" notice show on a fresh online
    // board. Its age is the "as of" day below.
    fromCache: false,
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
            tips: series.days.map((day, i) => ({
              title: dayTitle(day),
              rows: [
                ...shown.map(({ id }) => ({
                  label: t(LAYER_LABEL_KEYS[id]),
                  value: formatIskCompact(series.layers[id][i] ?? 0),
                })),
                { label: t(`${C}.tip.total`), value: formatIskCompact(series.totals[i] ?? 0) },
              ],
            })),
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

const SURVEY_PATH = '/mining/survey';

const survey: Builder = (feeds, { t, now }) => {
  const feed = feeds.survey;
  const data = feed?.data ?? null;
  if (!data) return blank(SURVEY_PATH, statusOf(feed));
  const summary = data.summary;
  const note = t(`${C}.survey.note`);
  const base = {
    ...blank(SURVEY_PATH, statusOf(feed, { isEmpty: summary === null })),
    emptyLinkLabel: t(`${W}.survey.emptyLink`),
    fetchedAt: data.fetchedAt,
  };
  if (summary === null) return { ...base, number: NEUTRAL_NUMBER, rows: [], summary: note };

  const volume = (m3: number) => t(`${D}.survey.volume`, { amount: formatCompactNumber(m3) });
  const finish = summary.etaAt === null ? null : formatEveClock(summary.etaAt);
  let number: NumberModel = {
    value: UNKNOWN,
    unit: t(`${D}.survey.noEta`),
    tone: 'clear',
  };
  if (summary.finished) {
    number = { value: t(`${D}.survey.finished`), tone: 'clear' };
  } else if (summary.etaAt !== null && finish !== null) {
    // Past its estimate with no scan to say so: the field is due, not confirmed gone.
    const overdue = summary.etaAt <= now;
    number = {
      value: overdue ? t(`${D}.survey.overdue`) : formatDuration((summary.etaAt - now) / 1000),
      unit: overdue ? undefined : t(`${D}.survey.unit`),
      secondary: {
        text:
          data.location === null
            ? t(`${D}.survey.secondary`, { time: finish })
            : t(`${D}.survey.secondaryAt`, { time: finish, place: data.location }),
      },
      tone: 'clear',
    };
  }

  // An ore with nothing left is done with: it has no row.
  const left = summary.ores.filter((o) => o.volume > 0);
  return {
    ...base,
    number,
    rows: [],
    table: {
      columns: [
        { key: 'ore', label: t(`${W}.survey.col.ore`), priority: 0 },
        { key: 'left', label: t(`${W}.survey.col.left`), align: 'end', priority: 0 },
      ],
      rows: left.map((o) => ({
        key: o.ore,
        cells: [o.ore, volume(o.volume)],
      })),
    },
    summary: note,
    chart:
      summary.points.length > 1
        ? {
            kind: 'survey',
            data: summary,
            note,
            summary: t(`${C}.survey.summary`, {
              percent: summary.percent,
              left: formatCompactNumber(summary.leftVolume),
              ores: left.map((o) => `${o.ore} ${volume(o.volume)}`).join(', '),
            }),
          }
        : undefined,
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

// --- Below-market contracts ---------------------------------------------------------

const BELOW_MARKET_PATH = '/contracts/search/items?items.belowMarket=1';

const belowMarket: Builder = (feeds, { t }) => {
  const feed = feeds.belowMarket;
  const data = feed?.data ?? null;
  if (!data) return blank(BELOW_MARKET_PATH, statusOf(feed));
  const best = data.contracts[0];
  const item = (c: { item: string; more: number }) =>
    c.more > 0 ? t(`${D}.belowMarket.item`, { item: c.item, count: c.more }) : c.item;
  const jumps = (c: { jumps: number | null }) => (c.jumps === null ? UNKNOWN : String(c.jumps));
  return {
    ...blank(BELOW_MARKET_PATH, statusOf(feed, { isEmpty: best === undefined })),
    emptyLinkLabel: t(`${W}.belowMarket.emptyLink`),
    fetchedAt: data.fetchedAt,
    number: best
      ? {
          value: data.count.toLocaleString(),
          unit: t(`${D}.belowMarket.unit`),
          secondary: {
            text:
              best.jumps === null
                ? t(`${D}.belowMarket.secondaryNoJumps`, { profit: formatIskCompact(best.profit) })
                : t(`${D}.belowMarket.secondary`, {
                    profit: formatIskCompact(best.profit),
                    jumps: String(best.jumps),
                  }),
            tone: 'good',
          },
          tone: 'clear',
        }
      : NEUTRAL_NUMBER,
    rows: [],
    table: {
      columns: [
        { key: 'item', label: t(`${W}.belowMarket.col.item`), priority: 0, nameFloor: true },
        { key: 'profit', label: t(`${W}.belowMarket.col.profit`), align: 'end', priority: 1 },
        { key: 'jumps', label: t(`${W}.belowMarket.col.jumps`), align: 'end', priority: 2 },
      ],
      rows: data.contracts.map((c) => ({
        key: String(c.contractId),
        cells: [item(c), `+${formatIskCompact(c.profit)}`, jumps(c)],
      })),
    },
    summary: t(`${D}.belowMarket.summary`, { count: data.count }),
  };
};

// --- Jump timers --------------------------------------------------------------------

const jumpTimers: Builder = (feeds, { t, now }) => {
  const feed = feeds.jumpTimers;
  const data = feed?.data ?? null;
  const to = '/clones';
  if (!data) return blank(to, statusOf(feed));
  const timers = [
    { key: 'clone', read: data.clone, endpoint: 'getCharacterClones', idle: 'ready' },
    { key: 'fatigue', read: data.fatigue, endpoint: 'getCharacterFatigue', idle: 'none' },
  ] as const;
  const missing = timers.filter((x) => x.read.state === 'needsPermission');
  const label = (x: (typeof timers)[number]) => {
    if (x.read.state === 'needsPermission') return t(`${W}.jumpTimers.needsPermission`);
    const left = secondsLeft(x.read.endsAt, now);
    return left > 0 ? formatCountdown(left) : t(`${W}.jumpTimers.${x.idle}`);
  };
  const longest = longestRemainingSeconds(
    timers.map((x) => (x.read.state === 'read' ? x.read.endsAt : null)),
    now
  );
  const firstMissing = missing[0];
  return {
    ...blank(to, statusOf(feed, { needsPermission: missing.length === timers.length })),
    fetchedAt: data.fetchedAt,
    number: {
      value: longest > 0 ? formatCountdown(longest) : t(`${W}.jumpTimers.ready`),
      secondary: firstMissing
        ? {
            text: t(`${W}.jumpTimers.missing`, { timer: t(`${W}.jumpTimers.${firstMissing.key}`) }),
          }
        : undefined,
      tone: 'clear',
    },
    rows: [],
    table: {
      columns: [
        { key: 'timer', label: t(`${W}.jumpTimers.col.timer`), priority: 0 },
        { key: 'left', label: t(`${W}.jumpTimers.col.left`), align: 'end', priority: 1 },
      ],
      rows: timers.map((x) => ({
        key: x.key,
        cells: [t(`${W}.jumpTimers.${x.key}`), label(x)],
      })),
    },
    summary: t(`${W}.jumpTimers.summary`, {
      clone: label(timers[0]),
      fatigue: label(timers[1]),
    }),
    grantEndpoints:
      missing.length > 0 && missing.length < timers.length
        ? missing.map((x) => x.endpoint)
        : undefined,
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
      : t(`${D}.location.security`, { value: fixed1(system.security) });
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
    fetchedAt: data.fetchedAt,
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
            tips: rollingTitles(t, 'hour', trend.hourly.length).map((title, i) => ({
              title,
              rows: [{ label: t(`${C}.tip.kills`), value: count(trend.hourly![i] ?? 0) }],
            })),
            note: t(`${C}.routeSafety.note`),
            summary: `${summary}${unreadNote}`,
          }
        : undefined,
  };
};

// --- Kills and losses -----------------------------------------------------------

const KILLS_PATH = '/travel/pilot';
/** Newest killmails the table lists. */
const KILLS_TABLE_ROWS = 25;
const KILLS_DAY_MS = 86_400_000;

const kills: Builder = (feeds, { t, now, range, scopeAll, activeCharacterId }) => {
  const feed = feeds.kills;
  const data = feed?.data ?? null;
  if (!data) return blank(KILLS_PATH, statusOf(feed));
  const everyone = scopeAll || activeCharacterId === null;
  const failedHere = !everyone && data.failedIds.includes(activeCharacterId);
  const tracked = everyone || data.trackedIds.includes(activeCharacterId);
  const window = `${range}d` as MiningYieldRange;
  const today = eveToday(new Date(now));
  const days = rangeDates(window, today);
  // The same calendar days the chart draws, so the bars add up to the headline.
  const since = Date.parse(`${days[0]}T00:00:00Z`);
  // Two of your Characters on one killmail is one kill: count the killmail once.
  const seen = new Set<number>();
  const inRange = data.entries.filter((entry) => {
    if (!everyone && entry.characterId !== activeCharacterId) return false;
    if (entry.timeMs < since || entry.timeMs > now || seen.has(entry.killmailId)) return false;
    seen.add(entry.killmailId);
    return true;
  });
  const base = {
    ...blank(
      KILLS_PATH,
      statusOf(failedHere ? { data, loading: false, error: true } : feed, {
        isEmpty: !failedHere && (!tracked || inRange.length === 0),
      })
    ),
    fetchedAt: data.fetchedAt,
  };
  if (inRange.length === 0) return base;

  const killCount = inRange.filter((entry) => entry.side === 'kill').length;
  const lossCount = inRange.length - killCount;
  const perDay = new Map<string, number>();
  const lossesPerDay = new Map<string, number>();
  for (const entry of inRange) {
    const day = new Date(entry.timeMs).toISOString().slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
    if (entry.side === 'loss') lossesPerDay.set(day, (lossesPerDay.get(day) ?? 0) + 1);
  }
  const values = days.map((date) => perDay.get(date) ?? 0);
  const peak = Math.max(...values);

  // zKillboard's first page holds 200 per list: a busy pilot's 90 days can reach further back than that.
  const reaches = (everyone ? data.trackedIds : [activeCharacterId]).flatMap((id) => {
    const value = data.reach[id];
    return value === undefined || value === null ? [] : [value];
  });
  const reachesBackTo = reaches.length === 0 ? null : Math.max(...reaches);
  const covered =
    reachesBackTo !== null && reachesBackTo > since
      ? Math.max(1, Math.ceil((now - reachesBackTo) / KILLS_DAY_MS))
      : null;

  const summary = t(`${C}.kills.summary`, {
    count: inRange.length,
    kills: killCount,
    losses: lossCount,
    range,
    peak,
    days: values.join(', '),
  });
  const shipName = (id: number | null) =>
    id === null ? UNKNOWN : (data.typeNames.get(id) ?? `#${id}`);
  const systemName = (id: number | null) =>
    id === null ? UNKNOWN : (data.systemNames.get(id) ?? `#${id}`);
  return {
    ...base,
    number: {
      value: count(inRange.length),
      unit: t(`${D}.kills.unit`, { count: inRange.length }),
      secondary: { text: t(`${D}.kills.secondary`, { kills: killCount, losses: lossCount }) },
      tone: 'clear',
    },
    rows: [],
    table: {
      columns: [
        { key: 'ship', label: t(`${W}.kills.col.ship`), priority: 0 },
        { key: 'system', label: t(`${W}.kills.col.system`), priority: 2 },
        { key: 'value', label: t(`${W}.kills.col.value`), align: 'end', priority: 3 },
        { key: 'side', label: t(`${W}.kills.col.side`), priority: 1 },
      ],
      rows: inRange.slice(0, KILLS_TABLE_ROWS).map((entry) => {
        const cells: TableCell[] = [
          shipName(entry.shipTypeId),
          systemName(entry.systemId),
          entry.value === null
            ? UNKNOWN
            : { text: formatIskCompact(entry.value), iskAmount: entry.value },
          entry.side === 'loss'
            ? { text: t(`${W}.kills.side.loss`), tone: 'bad' }
            : { text: t(`${W}.kills.side.kill`), tone: 'good' },
        ];
        return { key: String(entry.killmailId), cells };
      }),
    },
    summary,
    chart: {
      kind: 'bars',
      values,
      max: t(`${C}.kills.max`, { count: peak }),
      xStart: t(`${C}.kills.xStart`, { count: range }),
      xEnd: t(`${C}.kills.xEnd`),
      tips: days.map((date, i) => ({
        title: dayTitle(date),
        rows: [
          {
            label: t(`${C}.tip.kills`),
            value: count(values[i]! - (lossesPerDay.get(date) ?? 0)),
            tone: 'good' as const,
          },
          {
            label: t(`${C}.tip.losses`),
            value: count(lossesPerDay.get(date) ?? 0),
            tone: 'bad' as const,
          },
        ],
      })),
      note: [
        covered === null
          ? t(`${C}.kills.note`, { count: range })
          : t(`${C}.kills.noteCovered`, { count: range, covered }),
        everyone && data.failedIds.length > 0
          ? t(`${C}.kills.unread`, { count: data.failedIds.length })
          : '',
      ]
        .filter(Boolean)
        .join(' '),
      summary,
    },
  };
};

/** The kinds built in this file, each with the feeds it reads. */
export const KIND_DEFS: Readonly<Record<string, KindDef>> = {
  walletFlow: { feeds: ['journal'], build: walletFlow },
  netWorth: { feeds: ['netWorth'], build: netWorth },
  lp: { feeds: ['lp'], build: lp },
  clones: { feeds: ['clones'], build: clones },
  location: { feeds: ['location'], build: location },
  survey: { feeds: ['survey'], build: survey },
  hauling: { feeds: ['hauling'], build: hauling },
  belowMarket: { feeds: ['belowMarket'], build: belowMarket },
  jumpTimers: { feeds: ['jumpTimers'], build: jumpTimers },
  routeSafety: { feeds: ['routeSafety'], build: routeSafety },
  kills: { feeds: ['kills'], build: kills },
  omega: { feeds: ['omega'], build: omega },
  tradingProfit: { feeds: ['tradingProfit'], build: tradingProfit },
};
