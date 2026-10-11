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
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatCountdown } from '@/lib/duration';
import type { StackChartModel, StackPart } from '../charts/types';
import { UNKNOWN } from './builderKit';
import type { TableModel, TableRowModel, Translate } from './types';

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
