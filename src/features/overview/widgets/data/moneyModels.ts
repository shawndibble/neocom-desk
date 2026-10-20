/**
 * Tables and charts for the money kinds (orders, wallet, wallet flow, net
 * worth, price watch, stock, loyalty points, mining tax). Pure, like the
 * builders that call them: figures and a translate function in, plain models
 * out. Kept in one file so the money kinds' redesign stays out of the shared
 * `models.ts`, `kindModels.ts` and `chartBuilders.ts`.
 */
import { DAY_MS } from '@/lib/age';
import type { DeadlineSeverity } from '@/engine/character/severity';
import { ORDER_PROBLEMS, type OrderProblem } from '@/engine/market/orderProblems';
import { isPriceSpike } from '@/engine/market/priceVsMedian';
import { formatVsMedianPct } from '@/features/market/format';
import { notCheckedCount, type OpenOrderRow } from '@/features/market/openOrdersModel';
import type { WalletJournalEntry } from '@/esi/endpoints';
import { LAYER_IDS, type LayerId, type LayerValues } from '@/engine/netWorth/series';
import { humanizeRefType } from '@/features/character/format';
import { LAYER_LABEL_KEYS } from '@/features/netWorth/layerMeta';
import { formatAge } from '@/lib/age';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatCountdown } from '@/lib/duration';
import { formatIskCompact, formatIskCompactSigned } from '@/lib/isk';
import type { RefTypeBreakdownRow } from '@/features/character/walletJournalFilter';
import type { StockBoardMarket } from '@/features/stockTargets/stockBoard';
import type { PayeeOwed } from '../../data/miningTaxPayees';
import type {
  BarsChartModel,
  StackChartModel,
  StackPart,
  StackRowsChartModel,
} from '../charts/types';
import { backwardBucketSums } from './chartSeries';
import { rollingTitles, signTone } from './chartTips';
import type { NetWorthCharacter } from './kindLoaders';
import { STOCK_PATH, UNKNOWN } from './builderKit';
import { fractionBar, signedCell } from './cellKit';
import type { NumberSecondary, TableCell, TableModel, TableRowModel, Translate } from './types';

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

/** vs best as a number: signed like the cell, so "+5%" orders above "-10%"; nothing with no rival price. */
function vsBestSort(row: OpenOrderRow): number | undefined {
  const best = row.station.bestPrice;
  if (best === null) return undefined;
  const gap = Math.round(row.station.gapPct * 10) / 10;
  return row.price >= best ? gap : -gap;
}

/** Red when a rival's price beats mine (an undercut or outbid); nothing otherwise, since being ahead needs no flag. */
function vsBestCell(row: OpenOrderRow): TableCell {
  const text = signedPercent(row);
  return row.station.beatsMe ? { text, tone: 'bad' } : text;
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
      vsBestCell(row),
      expiresIn(t, row, now),
      shortStation(t, row.stationName),
    ],
    // Same order as the columns. The cells are compact text ("1.2M", "3d 4h"), so sorting
    // reads these instead; a lapsed order still sorts by when it lapsed.
    sort: [
      row.typeName,
      t(`${W}.orders.${row.isBuyOrder ? 'sideBuy' : 'sideSell'}`),
      row.price,
      vsBestSort(row),
      row.expiry?.expiresAt,
      row.stationName === null ? undefined : shortStation(t, row.stationName),
    ],
    tone: PROBLEM_TONE[row.problem],
  }));
  return {
    columns: [
      {
        key: 'item',
        label: t(`${W}.orders.col.item`),
        sortable: true,
        priority: 0,
        nameFloor: true,
      },
      {
        key: 'side',
        label: t(`${W}.orders.col.side`),
        sortable: true,
        priority: 4,
        hideNarrow: true,
      },
      {
        key: 'price',
        label: t(`${W}.orders.col.price`),
        sortable: true,
        align: 'end',
        priority: 2,
      },
      {
        key: 'vsBest',
        label: t(`${W}.orders.col.vsBest`),
        sortable: true,
        align: 'end',
        priority: 1,
      },
      {
        key: 'expires',
        label: t(`${W}.orders.col.expires`),
        sortable: true,
        align: 'end',
        priority: 3,
      },
      {
        key: 'station',
        label: t(`${W}.orders.col.station`),
        sortable: true,
        priority: 5,
        hideNarrow: true,
      },
    ],
    rows: tableRows,
    pageable: true,
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
  // An unchecked order reads healthy only for want of data: its own part.
  const unchecked = notCheckedCount(rows);
  for (const state of STATE_PARTS) {
    let n = rows.filter((row) => state.problems.includes(row.problem)).length;
    if (state.key === 'healthy') n -= unchecked;
    if (n === 0) continue;
    parts.push({
      key: state.key,
      label: t(`${W}.chart.ordersStates.${state.key}`),
      value: n,
      text: String(n),
      color: state.color,
    });
  }
  if (unchecked > 0) {
    parts.splice(1, 0, {
      key: 'notChecked',
      label: t(`${W}.chart.ordersStates.notChecked`),
      value: unchecked,
      text: String(unchecked),
      color: 's3',
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
        signedCell(formatIskCompactSigned(entry.amount ?? 0), entry.amount ?? 0),
        formatAge(Math.max(0, now - Date.parse(entry.date)), t),
        typeof entry.balance === 'number'
          ? { text: formatIskCompact(entry.balance), iskAmount: entry.balance }
          : UNKNOWN,
      ],
    })),
  };
}

// --- Wallet flow ---------------------------------------------------------------------

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

/**
 * One bar per period: what the wallet gained net, green above the axis, red
 * below it, each with its figure. Hover reads income, spending and net apart.
 * Null when ISK never moved.
 */
export function flowBars(
  t: Translate,
  entries: readonly WalletJournalEntry[],
  now: number,
  range: number,
  note: string,
  summary: string
): BarsChartModel | null {
  if (entries.length === 0) return null;
  const { daily, income, spending } = flowBuckets(entries, now, range);
  const tallest = Math.max(...income, ...spending);
  if (tallest <= 0) return null;
  const C = `${W}.chart`;
  const nets = income.map((v, i) => v - spending[i]!);
  const titles = rollingTitles(t, daily ? 'day' : 'week', nets.length);
  return {
    kind: 'bars',
    values: nets,
    gains: true,
    barLabels: nets.map((v) => (v === 0 ? '' : formatIskCompactSigned(v))),
    max: t(`${C}.max`, { value: formatIskCompact(Math.max(0, ...nets)) }),
    xStart: t(daily ? `${C}.daysAgo` : `${C}.weeksAgo`, { count: income.length }),
    xEnd: t(daily ? `${C}.today` : `${C}.thisWeek`),
    tips: nets.map((net, i) => ({
      title: titles[i]!,
      rows: [
        { label: t(`${C}.tip.income`), value: formatIskCompact(income[i]!), tone: 'good' },
        { label: t(`${C}.tip.spending`), value: formatIskCompact(spending[i]!), tone: 'bad' },
        { label: t(`${C}.tip.net`), value: formatIskCompactSigned(net), tone: signTone(net) },
      ],
    })),
    note,
    summary,
  };
}

/** A column that only ever runs one way: ISK in is good, ISK out is bad; zero is plain. */
function directionCell(text: string, value: number, tone: 'good' | 'bad'): TableCell {
  return value > 0 ? { text, tone } : text;
}

/** `part` of `whole` as a whole percent with its bar; the text states the share, the bar only draws it. */
function shareCell(part: number, whole: number): TableCell {
  const share = fractionBar(Math.max(0, part), whole);
  return share === undefined ? '0%' : { text: `${Math.round(share * 100)}%`, bar: share };
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
        signedCell(formatIskCompactSigned(row.net), row.net),
        directionCell(formatIskCompact(row.income), row.income, 'good'),
        directionCell(formatIskCompact(row.expense), row.expense, 'bad'),
        shareCell(row.income + row.expense, moved),
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
          shareCell(value, total),
          values.length >= 2
            ? signedCell(formatIskCompactSigned(value - values[0]!), value - values[0]!)
            : UNKNOWN,
        ],
      };
    }),
  };
}

// --- Market stock --------------------------------------------------------------------

/** "Amarr VIII (Oris) - Emperor Family Academy" reads as its first part on a widget. */
const marketName = (name: string): string => name.split(' - ')[0] ?? name;

/** Worst first: most out, then most low, then by name. */
function worstFirst(markets: readonly StockBoardMarket[]): StockBoardMarket[] {
  return [...markets].sort(
    (a, b) =>
      b.summary.out - a.summary.out || b.summary.low - a.summary.low || a.name.localeCompare(b.name)
  );
}

/** Every market, healthy ones too: how many items are out and low, what is ready to list, what restocking costs. */
export function stockTable(t: Translate, markets: readonly StockBoardMarket[]): TableModel {
  return {
    columns: [
      { key: 'market', label: t(`${W}.stock.col.market`), priority: 0 },
      { key: 'out', label: t(`${W}.stock.col.out`), align: 'end', priority: 2 },
      { key: 'low', label: t(`${W}.stock.col.low`), align: 'end', priority: 3 },
      { key: 'restock', label: t(`${W}.stock.col.restock`), align: 'end', priority: 1 },
      { key: 'ready', label: t(`${W}.stock.col.ready`), align: 'end', priority: 4 },
    ],
    rows: worstFirst(markets).map((market) => {
      const { out, low, readyToList, costToFill } = market.summary;
      return {
        key: market.listId,
        cells: [
          marketName(market.name),
          String(out),
          String(low),
          costToFill > 0 ? { text: formatIskCompact(costToFill), iskAmount: costToFill } : UNKNOWN,
          String(readyToList),
        ],
        tone: out > 0 ? 'critical' : low > 0 ? 'warning' : 'clear',
        to: `${STOCK_PATH}/${encodeURIComponent(market.listId)}`,
      };
    }),
  };
}

const STOCK_STATES = [
  { key: 'out', color: 'warning' },
  { key: 'low', color: 's4' },
  { key: 'ok', color: 'accent' },
  { key: 'over', color: 'neutral' },
] as const;

/**
 * One stacked bar per market, split Out / Low / OK / Over, so which side of
 * the target each market sits on is visible (a "% at target" hides it). A
 * market with no items is left out; null when none has any.
 */
export function stockChart(
  t: Translate,
  markets: readonly StockBoardMarket[]
): StackRowsChartModel | null {
  const stocked = worstFirst(markets).filter((market) => {
    const { out, low, ok, over } = market.summary;
    return out + low + ok + over > 0;
  });
  if (stocked.length === 0) return null;
  const legend: StackPart[] = STOCK_STATES.map(({ key, color }) => {
    const value = stocked.reduce((sum, market) => sum + market.summary[key], 0);
    return { key, label: t(`${W}.chart.stock.${key}`), value, text: String(value), color };
  });
  return {
    kind: 'stackRows',
    rows: stocked.map((market) => {
      const short = market.summary.out + market.summary.low;
      return {
        key: market.listId,
        label: marketName(market.name),
        parts: STOCK_STATES.map(({ key, color }) => ({
          key,
          value: market.summary[key],
          color,
        })),
        text: short > 0 ? t(`${W}.stock.rowShort`, { count: short }) : t(`${W}.stock.rowOk`),
      };
    }),
    legend,
    note: t(`${W}.chart.stock.note`),
    summary: t(`${W}.chart.stock.summary`, {
      markets: stocked
        .map((market) => {
          const { out, low, ok, over } = market.summary;
          return `${marketName(market.name)}: ${out} out, ${low} low, ${ok} ok, ${over} over`;
        })
        .join('; '),
    }),
  };
}

// --- Price watch ---------------------------------------------------------------------

interface WatchedPrice {
  typeId: number;
  name: string;
  direction: 'above' | 'below';
  targetPrice: number;
  /** The poller's last hub price; null when it has none for this target yet. */
  price: number | null;
  crossed: boolean;
  /** The latest price vs its 90-day median at the hub, in percent; null or absent when unknown. */
  vs90d?: number | null;
}

/** `+5%`, `-0.8%`, `0%`: a distance is read to a tenth of a percent below ten, whole above. */
function signedPercentOf(ratio: number): string {
  const pct = ratio * 100;
  const rounded = Math.abs(pct) < 10 ? Math.round(pct * 10) / 10 : Math.round(pct);
  if (rounded === 0) return '0%';
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded)}%`;
}

/** Within this fraction of its target a watched price is "close" (amber) until it crosses. */
export const NEAR_TARGET = 0.05;

/** Green once the target is hit, amber within `NEAR_TARGET` of it, plain beyond. */
function gapCell(alert: WatchedPrice, ratio: number): TableCell {
  const text = signedPercentOf(ratio);
  if (alert.crossed) return { text, tone: 'good' };
  return Math.abs(ratio) <= NEAR_TARGET ? { text, tone: 'caution' } : text;
}

/** "+35%" amber from the spike threshold, "−12%" plain, blank when unknown. */
function vs90dCell(value: number | null | undefined): TableCell {
  if (value === null || value === undefined) return '';
  const text = formatVsMedianPct(value);
  return isPriceSpike(value) ? { text, tone: 'caution' } : text;
}

/**
 * Each target against the price now: how far the price sits from it. Targets
 * that were hit first, then the nearest to being hit, those with no price yet
 * last.
 */
export function priceWatchTable(t: Translate, alerts: readonly WatchedPrice[]): TableModel {
  const distance = (alert: WatchedPrice) =>
    alert.price === null || alert.targetPrice <= 0
      ? Number.POSITIVE_INFINITY
      : Math.abs(alert.price - alert.targetPrice) / alert.targetPrice;
  const sorted = [...alerts].sort(
    (a, b) => Number(b.crossed) - Number(a.crossed) || distance(a) - distance(b)
  );
  return {
    columns: [
      { key: 'item', label: t(`${W}.priceWatch.col.item`), priority: 0 },
      { key: 'gap', label: t(`${W}.priceWatch.col.gap`), align: 'end', priority: 1 },
      { key: 'now', label: t(`${W}.priceWatch.col.now`), align: 'end', priority: 2 },
      { key: 'target', label: t(`${W}.priceWatch.col.target`), align: 'end', priority: 3 },
      { key: 'vs90d', label: t(`${W}.priceWatch.col.vs90d`), align: 'end', priority: 4 },
    ],
    rows: sorted.map((alert) => {
      const priced = alert.price !== null && alert.targetPrice > 0;
      return {
        key: `${alert.typeId}:${alert.direction}:${alert.targetPrice}`,
        cells: [
          alert.name,
          priced ? gapCell(alert, (alert.price! - alert.targetPrice) / alert.targetPrice) : UNKNOWN,
          alert.price === null
            ? UNKNOWN
            : { text: formatCompactNumber(alert.price), iskAmount: alert.price },
          t(`${W}.priceWatch.target.${alert.direction}`, {
            isk: formatCompactNumber(alert.targetPrice),
          }),
          vs90dCell(alert.vs90d),
        ],
        tone: alert.crossed ? 'warning' : 'clear',
      };
    }),
  };
}

// --- Loyalty points ------------------------------------------------------------------

/** Each corporation's points and its share of all of them (a sliver reads `<1%`, never `0%`). */
export function lpTable(
  t: Translate,
  entries: readonly { corporationId: number; name: string | null; points: number }[]
): TableModel {
  const total = entries.reduce((sum, entry) => sum + entry.points, 0);
  const shareOf = (points: number): TableCell => {
    const bar = fractionBar(Math.max(0, points), total);
    if (bar === undefined) return '0%';
    const pct = Math.round(bar * 100);
    return { text: pct === 0 && points > 0 ? '<1%' : `${pct}%`, bar };
  };
  return {
    columns: [
      { key: 'corporation', label: t(`${W}.lp.col.corporation`), priority: 0 },
      { key: 'lp', label: t(`${W}.lp.col.lp`), align: 'end', priority: 1 },
      { key: 'share', label: t(`${W}.lp.col.share`), align: 'end', priority: 2 },
    ],
    rows: entries.map((entry) => ({
      key: String(entry.corporationId),
      cells: [
        entry.name ?? t(`${W}.data.lp.corporation`, { id: entry.corporationId }),
        formatCompactNumber(entry.points),
        shareOf(entry.points),
      ],
    })),
  };
}

// --- Mining tax ----------------------------------------------------------------------

/** What each payee is owed, how long the oldest of it has waited and over how many entries. */
export function miningTaxTable(
  t: Translate,
  payees: readonly PayeeOwed[],
  unassignedCount: number
): TableModel {
  return {
    columns: [
      { key: 'payee', label: t(`${W}.miningTax.col.payee`), priority: 0 },
      { key: 'unpaid', label: t(`${W}.miningTax.col.unpaid`), align: 'end', priority: 1 },
      { key: 'oldest', label: t(`${W}.miningTax.col.oldest`), align: 'end', priority: 2 },
      { key: 'entries', label: t(`${W}.miningTax.col.entries`), align: 'end', priority: 3 },
    ],
    rows: payees.map((payee) => ({
      key: payee.payeeId || 'none',
      cells: [
        payee.name || t(`${W}.miningTax.noPayee`),
        { text: formatIskCompact(payee.unpaidIsk), iskAmount: payee.unpaidIsk },
        payee.oldestDays === null ? UNKNOWN : t(`${W}.miningTax.days`, { count: payee.oldestDays }),
        String(payee.entries),
      ],
    })),
    footer:
      unassignedCount > 0 ? t(`${W}.miningTax.unassigned`, { count: unassignedCount }) : undefined,
  };
}
