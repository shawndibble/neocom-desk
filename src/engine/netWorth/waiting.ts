/**
 * The Balance tab's "ISK waiting" and wallet Goal maths. Pure: Net Worth
 * Snapshots in, display-ready numbers out. Both read the same stored days as the
 * net worth chart, so nothing here needs a fresh ESI read.
 */
import { DAY_MS } from '@/lib/age';
import { shiftUtcDate } from '../localDay';
import { layerValues } from './series';
import type { NetWorthSnapshotRow } from './snapshot';

export interface IskWaiting {
  sellOrders: number;
  escrow: number;
  contracts: number;
  total: number;
}

/** Days a Character's snapshots must span before a pace is worked out from them. */
export const GOAL_MIN_SPAN_DAYS = 7;
/** A Character whose newest snapshot is older than this many days is left out of the figures. */
export const WAITING_STALE_DAYS = 7;
/** Largest Goal target: past it the amount no longer round-trips through its text field. */
export const GOAL_MAX_TARGET = 1e15;
/** How far back the pace looks. */
export const GOAL_WINDOW_DAYS = 30;

const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

function byCharacter(rows: readonly NetWorthSnapshotRow[], today: string) {
  const staleBefore = shiftUtcDate(today, -WAITING_STALE_DAYS);
  const map = new Map<number, NetWorthSnapshotRow[]>();
  for (const row of rows) {
    const list = map.get(row.characterId) ?? [];
    list.push(row);
    map.set(row.characterId, list);
  }
  for (const [id, list] of map) {
    list.sort((a, b) => a.day.localeCompare(b.day));
    if (list[list.length - 1]!.day < staleBefore) map.delete(id);
  }
  return map;
}

/** ISK parked in sell orders, buy-order escrow and contracts, at each fresh Character's newest day. */
export function iskWaiting(rows: readonly NetWorthSnapshotRow[], today: string): IskWaiting {
  const out = { sellOrders: 0, escrow: 0, contracts: 0, total: 0 };
  for (const list of byCharacter(rows, today).values()) {
    const values = layerValues(list[list.length - 1]!);
    out.sellOrders += values.sellOrders;
    out.escrow += values.escrow;
    out.contracts += values.contracts;
  }
  out.total = out.sellOrders + out.escrow + out.contracts;
  return out;
}

export interface GoalProgress {
  /** Wallet ISK now: each Character's newest snapshot, summed. */
  current: number;
  target: number;
  /** 0 to 1; 0 without a positive target. */
  fraction: number;
  reached: boolean;
  /** Wallet gain per day over the window; null when too little history or not growing. */
  perDay: number | null;
  /** UTC day the target is reached at that pace; null when reached or no pace. */
  projectedDay: string | null;
}

export function goalProgress(input: {
  target: number;
  rows: readonly NetWorthSnapshotRow[];
  today: string;
}): GoalProgress {
  const { target, rows, today } = input;
  const floor = shiftUtcDate(today, -GOAL_WINDOW_DAYS);
  let current = 0;
  let perDay = 0;
  let paced = false;
  let newestDay = '';
  for (const list of byCharacter(rows, today).values()) {
    const latest = list[list.length - 1]!;
    current += latest.wallet;
    if (latest.day > newestDay) newestDay = latest.day;
    const first = list.find((row) => row.day >= floor);
    if (!first) continue;
    const span = (dayMs(latest.day) - dayMs(first.day)) / DAY_MS;
    if (span < GOAL_MIN_SPAN_DAYS) continue;
    perDay += (latest.wallet - first.wallet) / span;
    paced = true;
  }
  const reached = target > 0 && current >= target;
  const pace = paced && perDay > 0 ? perDay : null;
  const projectedDay =
    !reached && pace !== null && target > 0 && newestDay !== ''
      ? shiftUtcDate(newestDay, Math.ceil((target - current) / pace))
      : null;
  return {
    current,
    target,
    fraction: target > 0 ? Math.min(1, current / target) : 0,
    reached,
    perDay: pace,
    projectedDay,
  };
}

/**
 * Wallet ISK gained (or lost) over the window: each Character's newest snapshot
 * against its oldest one inside it, summed. Null with fewer than two days to
 * compare. Transfers between a pilot's own Characters cancel only when all are
 * in `rows`.
 */
export function walletChange(rows: readonly NetWorthSnapshotRow[], today: string): number | null {
  const floor = shiftUtcDate(today, -GOAL_WINDOW_DAYS);
  let change = 0;
  let any = false;
  for (const list of byCharacter(rows, today).values()) {
    const first = list.find((row) => row.day >= floor);
    const latest = list[list.length - 1]!;
    if (!first || first.day === latest.day) continue;
    change += latest.wallet - first.wallet;
    any = true;
  }
  return any ? change : null;
}
