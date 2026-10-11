/**
 * Tables and charts for the money kinds (orders, wallet, wallet flow, net
 * worth, price watch, stock, loyalty points, mining tax). Pure, like the
 * builders that call them: figures and a translate function in, plain models
 * out. Kept in one file so the money kinds' redesign stays out of the shared
 * `models.ts`, `kindModels.ts` and `chartBuilders.ts`.
 */
import type { DeadlineSeverity } from '@/engine/severity';
import { ORDER_PROBLEMS, type OrderProblem } from '@/engine/market/orderProblems';
import type { OpenOrderRow } from '@/features/market/openOrdersModel';
import type { WalletJournalEntry } from '@/esi/endpoints';
import { LAYER_IDS, type LayerId, type LayerValues } from '@/engine/netWorth/series';
import { humanizeRefType } from '@/features/character/format';
import { LAYER_LABEL_KEYS } from '@/features/netWorth/layerMeta';
import { formatAge } from '@/lib/age';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatCountdown } from '@/lib/duration';
import { formatIskCompact, formatIskCompactSigned } from '@/lib/isk';
import type { RefTypeBreakdownRow } from '@/features/character/walletJournalFilter';
import type { DivergingChartModel, StackChartModel, StackPart } from '../charts/types';
import { backwardBucketSums } from './chartSeries';
import type { NetWorthCharacter } from './kindLoaders';
import { UNKNOWN } from './builderKit';
import type { NumberSecondary, TableModel, TableRowModel, Translate } from './types';

const W = 'overview.widgets';

// --- Open orders -------------------------------------------------------------------

/** ISK on the sell side: what is listed. A buy order's ISK is escrow, not stock for sale. */
export function ordersListed(rows: readonly OpenOrderRow[]): number {
  return rows.reduce((sum, row) => (row.isBuyOrder ? sum : sum + row.iskTiedUp), 0);
}

const PROBLEM_TONE: Record<OrderProblem, DeadlineSeverity> = {
  belowFloor: 'critical',
  undercutStation: 'warning',
  undercutSystem: 'warning',
  undercutRegion: 'warning',
  outbid: 'warning',
  expiringOrStale: 'watch',
  healthy: 'clear',
};

const PROBLEM_RANK = new Map(ORDER_PROBLEMS.map((problem, i) => [problem, i]));

/** `12.4` for 12.4, `5` for 5.0: a gap is read to a tenth of a percent at most. */
function signedPercent(row: OpenOrderRow): string {
  const best = row.station.bestPrice;
  if (best === null) return UNKNOWN;
  const gap = Math.round(row.station.gapPct * 10) / 10;
  if (gap === 0) return '0%';
  return `${row.price >= best ? '+' : '-'}${gap}%`;
}

/** "Jita IV - Moon 4 - Caldari Navy Assembly Plant" is "Jita IV" on a widget. */
function shortStation(t: Translate, name: string | null): string {
  return name === null ? t(`${W}.orders.stationUnknown`) : (name.split(' - ')[0] ?? name);
}

function expiresIn(t: Translate, row: OpenOrderRow, now: number): string {
  if (row.expiry === null) return UNKNOWN;
  if (row.expiry.expired || row.expiry.expiresAt <= now) return t(`${W}.orders.expired`);
  return formatCountdown((row.expiry.expiresAt - now) / 1000);
}

/**
 * Every open order as a record: the item and how many are left, which side,
 * the price, how far it sits from the best rival price at its station, when
 * it lapses and where. Worst problem first, then the most ISK tied up. The
 * slots used against the cap (when known) is the footer.
 */
export function ordersTable(
  t: Translate,
  rows: readonly OpenOrderRow[],
  now: number,
  slots: { used: number; total: number } | null
): TableModel {
  const sorted = [...rows].sort(
    (a, b) =>
      (PROBLEM_RANK.get(a.problem) ?? 99) - (PROBLEM_RANK.get(b.problem) ?? 99) ||
      b.iskTiedUp - a.iskTiedUp ||
      a.orderId - b.orderId
  );
  const tableRows: TableRowModel[] = sorted.map((row) => ({
    key: String(row.orderId),
    cells: [
      `${row.typeName} ×${formatCompactNumber(row.volumeRemain)}`,
      t(`${W}.orders.${row.isBuyOrder ? 'sideBuy' : 'sideSell'}`),
      { text: formatCompactNumber(row.price), iskAmount: row.price },
      signedPercent(row),
      expiresIn(t, row, now),
      shortStation(t, row.stationName),
    ],
    tone: PROBLEM_TONE[row.problem],
  }));
  return {
    columns: [
      { key: 'item', label: t(`${W}.orders.col.item`), priority: 0 },
      { key: 'side', label: t(`${W}.orders.col.side`), priority: 4 },
      { key: 'price', label: t(`${W}.orders.col.price`), align: 'end', priority: 2 },
      { key: 'vsBest', label: t(`${W}.orders.col.vsBest`), align: 'end', priority: 1 },
      { key: 'expires', label: t(`${W}.orders.col.expires`), align: 'end', priority: 3 },
      { key: 'station', label: t(`${W}.orders.col.station`), priority: 5 },
    ],
    rows: tableRows,
    footer: slots ? t(`${W}.orders.slots`, slots) : undefined,
  };
}

const STATE_PARTS: readonly {
  key: string;
  problems: readonly OrderProblem[];
  color: StackPart['color'];
}[] = [
  { key: 'healthy', problems: ['healthy'], color: 'neutral' },
  {
    key: 'undercut',
    problems: ['undercutStation', 'undercutSystem', 'undercutRegion'],
    color: 'warning',
  },
  { key: 'outbid', problems: ['outbid'], color: 's1' },
  { key: 'expiring', problems: ['expiringOrStale'], color: 's2' },
  { key: 'belowFloor', problems: ['belowFloor'], color: 's4' },
];

/** One bar of order states, each order in exactly one (its worst problem); null with no orders. */
export function ordersStateChart(
  t: Translate,
  rows: readonly OpenOrderRow[]
): StackChartModel | null {
  if (rows.length === 0) return null;
  const parts: StackPart[] = [];
  for (const state of STATE_PARTS) {
    const n = rows.filter((row) => state.problems.includes(row.problem)).length;
    if (n === 0) continue;
    parts.push({
      key: state.key,
      label: t(`${W}.chart.ordersStates.${state.key}`),
      value: n,
      text: String(n),
      color: state.color,
    });
  }
  return {
    kind: 'stack',
    parts,
    summary: t(`${W}.chart.ordersStates.summary`, {
      open: rows.length,
      parts: parts.map((part) => `${part.label} ${part.text}`).join(', '),
    }),
  };
}

// --- Wallet --------------------------------------------------------------------------

/**
 * How far a balance moved over the days a series covers, as the Number's one
 * secondary line: the text carries the signed figure and the span, the shell
 * draws the direction glyph. More ISK is good; the tone follows that, not the
 * sign. `keyPrefix` picks the kind's own wording (`change` and `unchanged`).
 */
export function balanceChange(
  t: Translate,
  values: readonly number[],
  keyPrefix = `${W}.wallet`
): NumberSecondary | undefined {
  if (values.length < 2) return undefined;
  const delta = values[values.length - 1]! - values[0]!;
  const isk = formatIskCompactSigned(delta);
  if (isk === '0') {
    return { text: t(`${keyPrefix}.unchanged`, { count: values.length }), direction: 'flat' };
  }
  return {
    text: t(`${keyPrefix}.change`, { isk, count: values.length }),
    direction: delta > 0 ? 'up' : 'down',
    tone: delta > 0 ? 'good' : 'bad',
  };
}

const JOURNAL_ROWS = 6;

/** The newest journal entries that moved ISK: what it was, how much, how long ago, and the balance after. */
export function journalTable(
  t: Translate,
  entries: readonly WalletJournalEntry[],
  now: number
): TableModel {
  const newest = entries
    .filter((entry) => typeof entry.amount === 'number')
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, JOURNAL_ROWS);
  return {
    columns: [
      { key: 'type', label: t(`${W}.wallet.col.type`), priority: 0 },
      { key: 'amount', label: t(`${W}.wallet.col.amount`), align: 'end', priority: 1 },
      { key: 'when', label: t(`${W}.wallet.col.when`), align: 'end', priority: 2 },
      { key: 'balance', label: t(`${W}.wallet.col.balance`), align: 'end', priority: 3 },
    ],
    rows: newest.map((entry) => ({
      key: String(entry.id),
      cells: [
        humanizeRefType(entry.ref_type),
        formatIskCompactSigned(entry.amount ?? 0),
        formatAge(Math.max(0, now - Date.parse(entry.date)), t),
        typeof entry.balance === 'number'
          ? { text: formatIskCompact(entry.balance), iskAmount: entry.balance }
          : UNKNOWN,
      ],
    })),
  };
}

// --- Wallet flow ---------------------------------------------------------------------

const DAY_MS = 86_400_000;

export interface FlowBuckets {
  /** A bar per day (a 7-day range) rather than per week. */
  daily: boolean;
  income: number[];
  /** Positive magnitudes. */
  spending: number[];
}

/** Income and spending per period over the range, newest last: days up to a week, weeks beyond. */
export function flowBuckets(
  entries: readonly WalletJournalEntry[],
  now: number,
  range: number
): FlowBuckets {
  const daily = range <= 7;
  const bucketMs = daily ? DAY_MS : 7 * DAY_MS;
  const count = daily ? range : Math.ceil(range / 7);
  const at = (entry: WalletJournalEntry) => Date.parse(entry.date);
  const income = backwardBucketSums(
    entries,
    at,
    (entry) => Math.max(0, entry.amount ?? 0),
    now,
    bucketMs,
    count
  );
  const spending = backwardBucketSums(
    entries,
    at,
    (entry) => Math.max(0, -(entry.amount ?? 0)),
    now,
    bucketMs,
    count
  );
  return { daily, income, spending };
}

/** Paired bars of income above the axis and spending below it; null when ISK never moved. */
export function flowDiverging(
  t: Translate,
  entries: readonly WalletJournalEntry[],
  now: number,
  range: number,
  note: string,
  summary: string
): DivergingChartModel | null {
  if (entries.length === 0) return null;
  const { daily, income, spending } = flowBuckets(entries, now, range);
  const tallest = Math.max(...income, ...spending);
  if (tallest <= 0) return null;
  const C = `${W}.chart`;
  return {
    kind: 'diverging',
    up: income,
    down: spending,
    max: t(`${C}.max`, { value: formatIskCompact(tallest) }),
    xStart: t(daily ? `${C}.daysAgo` : `${C}.weeksAgo`, { count: income.length }),
    xEnd: t(daily ? `${C}.today` : `${C}.thisWeek`),
    note,
    summary,
  };
}

/** Per ref type: net, what came in, what went out, and its share of all the ISK that moved. */
export function flowTable(t: Translate, rows: readonly RefTypeBreakdownRow[]): TableModel {
  const moved = rows.reduce((sum, row) => sum + row.income + row.expense, 0);
  return {
    columns: [
      { key: 'type', label: t(`${W}.walletFlow.col.type`), priority: 0 },
      { key: 'net', label: t(`${W}.walletFlow.col.net`), align: 'end', priority: 1 },
      { key: 'income', label: t(`${W}.walletFlow.col.income`), align: 'end', priority: 2 },
      { key: 'spending', label: t(`${W}.walletFlow.col.spending`), align: 'end', priority: 3 },
      { key: 'share', label: t(`${W}.walletFlow.col.share`), align: 'end', priority: 4 },
    ],
    rows: rows.map((row) => ({
      key: row.refType,
      cells: [
        humanizeRefType(row.refType),
        formatIskCompactSigned(row.net),
        formatIskCompact(row.income),
        formatIskCompact(row.expense),
        `${moved > 0 ? Math.round(((row.income + row.expense) / moved) * 100) : 0}%`,
      ],
    })),
  };
}

/**
 * The Number's one line. Against the previous window when the journal reaches
 * back far enough to hold one (twice the range): the net's rise or fall, with
 * its direction and whether it is good. Otherwise the biggest source of
 * income, so the line still says something the net does not.
 */
export function flowSecondary(
  t: Translate,
  entries: readonly WalletJournalEntry[],
  now: number,
  range: number,
  coveredDays: number,
  rows: readonly RefTypeBreakdownRow[]
): NumberSecondary | undefined {
  if (coveredDays >= 2 * range) {
    const net = (from: number, to: number) =>
      entries.reduce((sum, entry) => {
        const at = Date.parse(entry.date);
        return at > from && at <= to ? sum + (entry.amount ?? 0) : sum;
      }, 0);
    const delta =
      net(now - range * DAY_MS, now) - net(now - 2 * range * DAY_MS, now - range * DAY_MS);
    const isk = formatIskCompactSigned(delta);
    if (isk === '0')
      return { text: t(`${W}.walletFlow.unchanged`, { count: range }), direction: 'flat' };
    return {
      text: t(`${W}.walletFlow.change`, { isk, count: range }),
      direction: delta > 0 ? 'up' : 'down',
      tone: delta > 0 ? 'good' : 'bad',
    };
  }
  const top = rows.filter((row) => row.income > 0).sort((a, b) => b.income - a.income)[0];
  if (!top) return undefined;
  return {
    text: t(`${W}.walletFlow.top`, {
      name: humanizeRefType(top.refType),
      isk: formatIskCompact(top.income),
    }),
  };
}

// --- Net worth -----------------------------------------------------------------------

export interface NetWorthSeries {
  /** One UTC day per point, oldest first. */
  days: string[];
  layers: Record<LayerId, number[]>;
  totals: number[];
}

/**
 * The days the included Characters were all being recorded, with each layer
 * summed across them. A Character with no snapshot on a day carries its last
 * one forward; a day before every Character has a first snapshot is left out,
 * because unknown is not zero and a late-added alt would draw a jump.
 */
export function netWorthSeries(characters: readonly NetWorthCharacter[]): NetWorthSeries {
  const out: NetWorthSeries = {
    days: [],
    layers: { isk: [], assets: [], escrow: [], sellOrders: [] },
    totals: [],
  };
  if (characters.length === 0) return out;
  const days = [...new Set(characters.flatMap((c) => c.history.map((row) => row.day)))].sort();
  const cursors = characters.map(() => ({ at: -1 }));
  for (const day of days) {
    const sum: LayerValues = { isk: 0, assets: 0, escrow: 0, sellOrders: 0 };
    let everyoneStarted = true;
    characters.forEach((character, i) => {
      const cursor = cursors[i]!;
      while (
        cursor.at + 1 < character.history.length &&
        character.history[cursor.at + 1]!.day <= day
      ) {
        cursor.at += 1;
      }
      const row = character.history[cursor.at];
      if (!row) {
        everyoneStarted = false;
        return;
      }
      for (const id of LAYER_IDS) sum[id] += row.layers[id];
    });
    if (!everyoneStarted) continue;
    out.days.push(day);
    let total = 0;
    for (const id of LAYER_IDS) {
      out.layers[id].push(sum[id]);
      total += sum[id];
    }
    out.totals.push(total);
  }
  return out;
}

/** Each layer's value now (the latest snapshots), its share of the total, and how it changed over the series. */
export function netWorthTable(
  t: Translate,
  now: LayerValues,
  series: NetWorthSeries,
  layers: readonly LayerId[]
): TableModel {
  const total = LAYER_IDS.reduce((sum, id) => sum + now[id], 0);
  return {
    columns: [
      { key: 'layer', label: t(`${W}.netWorth.col.layer`), priority: 0 },
      { key: 'value', label: t(`${W}.netWorth.col.value`), align: 'end', priority: 1 },
      { key: 'share', label: t(`${W}.netWorth.col.share`), align: 'end', priority: 2 },
      { key: 'change', label: t(`${W}.netWorth.col.change`), align: 'end', priority: 3 },
    ],
    rows: layers.map((id) => {
      const values = series.layers[id];
      const value = now[id];
      return {
        key: id,
        cells: [
          t(LAYER_LABEL_KEYS[id]),
          { text: formatIskCompact(value), iskAmount: value },
          `${total > 0 ? Math.round((Math.max(0, value) / total) * 100) : 0}%`,
          values.length >= 2 ? formatIskCompactSigned(value - values[0]!) : UNKNOWN,
        ],
      };
    }),
  };
}
