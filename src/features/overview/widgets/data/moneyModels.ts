import { DAY_MS } from '@/lib/age';
import { isPriceSpike } from '@/engine/market/priceVsMedian';
import { formatVsMedianPct } from '@/features/market/format';
import type { WalletJournalEntry } from '@/esi/endpoints';
import { LAYER_IDS, netWorthOf, type LayerId, type LayerValues } from '@/engine/netWorth/series';
import { humanizeRefType } from '@/features/character/format';
import { LAYER_LABEL_KEYS } from '@/features/netWorth/layerMeta';
import { formatAge } from '@/lib/age';
import { formatCompactNumber } from '@/lib/compactNumber';
import { highlightHref } from '@/lib/highlightParam';
import { formatIskCompact, formatIskCompactSigned } from '@/lib/isk';
import type { RefTypeBreakdownRow } from '@/features/character/walletJournalFilter';
import type { StockBoardMarket } from '@/features/stockTargets/stockBoard';
import type { PayeeOwed } from '../../data/miningTaxPayees';
import type { BarsChartModel, StackPart, StackRowsChartModel } from '../charts/types';
import { backwardBucketSums } from './chartSeries';
import { rollingTitles, signTone } from './chartTips';
import type { NetWorthCharacter } from './kindLoaders';
import { STOCK_PATH, UNKNOWN } from './builderKit';
import { fractionBar, shareCell, signedCell } from './cellKit';
import type { NumberSecondary, TableCell, TableModel } from './types';
import type { Translate } from '@/lib/translate';

const W = 'overview.widgets';

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
const JOURNAL_PATH = '/wallet/journal';

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
      to: highlightHref(JOURNAL_PATH, entry.id),
    })),
  };
}

export interface FlowBuckets {
  daily: boolean;
  income: number[];
  spending: number[];
}

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

function directionCell(text: string, value: number, tone: 'good' | 'bad'): TableCell {
  return value > 0 ? { text, tone } : text;
}

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

export interface NetWorthSeries {
  days: string[];
  layers: Record<LayerId, number[]>;
  totals: number[];
}

export function netWorthSeries(characters: readonly NetWorthCharacter[]): NetWorthSeries {
  const out: NetWorthSeries = {
    days: [],
    layers: { isk: [], assets: [], escrow: [], sellOrders: [], contracts: [] },
    totals: [],
  };
  if (characters.length === 0) return out;
  const days = [...new Set(characters.flatMap((c) => c.history.map((row) => row.day)))].sort();
  const cursors = characters.map(() => ({ at: -1 }));
  for (const day of days) {
    const sum: LayerValues = { isk: 0, assets: 0, escrow: 0, sellOrders: 0, contracts: 0 };
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

export function netWorthTable(
  t: Translate,
  now: LayerValues,
  series: NetWorthSeries,
  layers: readonly LayerId[]
): TableModel {
  const total = netWorthOf(now, layers);
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

const marketName = (name: string): string => name.split(' - ')[0] ?? name;

function worstFirst(markets: readonly StockBoardMarket[]): StockBoardMarket[] {
  return [...markets].sort(
    (a, b) =>
      b.summary.out - a.summary.out || b.summary.low - a.summary.low || a.name.localeCompare(b.name)
  );
}

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

interface WatchedPrice {
  typeId: number;
  name: string;
  direction: 'above' | 'below';
  targetPrice: number;
  price: number | null;
  crossed: boolean;
  vs90d?: number | null;
}

function signedPercentOf(ratio: number): string {
  const pct = ratio * 100;
  const rounded = Math.abs(pct) < 10 ? Math.round(pct * 10) / 10 : Math.round(pct);
  if (rounded === 0) return '0%';
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded)}%`;
}

export const NEAR_TARGET = 0.05;

function targetCell(direction: string, targetPrice: number): TableCell {
  return {
    text: `${direction} ${formatIskCompact(targetPrice)}`,
    iskAmount: targetPrice,
    prefix: direction,
  };
}

function gapCell(alert: WatchedPrice, ratio: number): TableCell {
  const text = signedPercentOf(ratio);
  if (alert.crossed) return { text, tone: 'good' };
  return Math.abs(ratio) <= NEAR_TARGET ? { text, tone: 'caution' } : text;
}

function vs90dCell(value: number | null | undefined): TableCell {
  if (value === null || value === undefined) return '';
  const text = formatVsMedianPct(value);
  return isPriceSpike(value) ? { text, tone: 'caution' } : text;
}

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
            : { text: formatIskCompact(alert.price), iskAmount: alert.price },
          targetCell(t(`${W}.priceWatch.target.${alert.direction}`), alert.targetPrice),
          vs90dCell(alert.vs90d),
        ],
        tone: alert.crossed ? 'warning' : 'clear',
        info: { typeId: alert.typeId },
      };
    }),
  };
}

export const LP_STORE_PATH = '/wallet/lp-store';

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
      to: `${LP_STORE_PATH}/${entry.corporationId}`,
      cells: [
        entry.name ?? t(`${W}.data.lp.corporation`, { id: entry.corporationId }),
        formatCompactNumber(entry.points),
        shareOf(entry.points),
      ],
    })),
  };
}

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
