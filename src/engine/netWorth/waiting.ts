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

export const GOAL_MIN_SPAN_DAYS = 7;
export const WAITING_STALE_DAYS = 7;
export const GOAL_MAX_TARGET = 1e15;
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
  current: number;
  target: number;
  fraction: number;
  reached: boolean;
  perDay: number | null;
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
