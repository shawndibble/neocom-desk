/**
 * Table and chart for the Open orders kind. Pure: order rows and a translate
 * function in, plain models out.
 */
import type { DeadlineSeverity } from '@/engine/character/severity';
import { ORDER_PROBLEMS, type OrderProblem } from '@/engine/market/orderProblems';
import { notCheckedCount, type OpenOrderRow } from '@/features/market/openOrdersModel';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatCountdown } from '@/lib/duration';
import type { StackChartModel, StackPart } from '../charts/types';
import { UNKNOWN } from './builderKit';
import type { TableCell, TableModel, TableRowModel, Translate } from './types';

const W = 'overview.widgets';

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
