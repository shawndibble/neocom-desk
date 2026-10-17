/**
 * Period sums over the Margin column (issue #3995): the Trading profit a date
 * range made, per day and per item, and the broker fees paid beside it.
 *
 * A total counts matched sales only. A sale without a margin (a sold build, a
 * missing tax line, stock the wallet never saw bought) adds nothing, and is
 * counted in `sales` but not `matched`, so the reader sees how much of the
 * range the figure covers. Broker fees carry no key to a sale, so they are a
 * period total shown beside the margin, never taken off it.
 *
 * Pure: the caller supplies the day-key function (a viewer's zone is a UI
 * concern) and the margins from `realizedMargins`.
 */
import type { RealizedMargin } from './realizedMargin';

export interface SaleFill {
  transactionId: number;
  date: string;
  typeId: number;
  isBuy: boolean;
}

export interface MarginTotal {
  margin: number;
  /** Sales that have a margin. */
  matched: number;
  /** All sales (buys are not counted). */
  sales: number;
}

export function sumMargins(
  fills: readonly SaleFill[],
  margins: ReadonlyMap<number, RealizedMargin>
): MarginTotal {
  const total: MarginTotal = { margin: 0, matched: 0, sales: 0 };
  for (const fill of fills) {
    if (fill.isBuy) continue;
    total.sales += 1;
    const m = margins.get(fill.transactionId);
    if (!m) continue;
    total.matched += 1;
    total.margin += m.margin;
  }
  return total;
}

export interface DayMargin extends MarginTotal {
  dayKey: string;
}

/** Margin per day, oldest first. `dayKeyOf` must return sortable keys (`YYYY-MM-DD`). */
export function marginsByDay(
  fills: readonly SaleFill[],
  margins: ReadonlyMap<number, RealizedMargin>,
  dayKeyOf: (date: string) => string
): DayMargin[] {
  const byDay = new Map<string, SaleFill[]>();
  for (const fill of fills) {
    if (fill.isBuy) continue;
    const key = dayKeyOf(fill.date);
    const list = byDay.get(key);
    if (list) list.push(fill);
    else byDay.set(key, [fill]);
  }
  return [...byDay.entries()]
    .map(([dayKey, list]) => ({ dayKey, ...sumMargins(list, margins) }))
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

export interface ItemMargin extends MarginTotal {
  typeId: number;
}

/** Matched margin per item, best first. */
export function marginsByItem(
  fills: readonly SaleFill[],
  margins: ReadonlyMap<number, RealizedMargin>
): ItemMargin[] {
  const byItem = new Map<number, SaleFill[]>();
  for (const fill of fills) {
    if (fill.isBuy) continue;
    const list = byItem.get(fill.typeId);
    if (list) list.push(fill);
    else byItem.set(fill.typeId, [fill]);
  }
  return [...byItem.entries()]
    .map(([typeId, list]) => ({ typeId, ...sumMargins(list, margins) }))
    .sort((a, b) => b.margin - a.margin);
}

interface FeeLine {
  ref_type: string;
  amount?: number;
  date: string;
}

/** Broker fees paid in `[fromMs, toMs]`, as a positive total. */
export function sumBrokerFees(journal: readonly FeeLine[], fromMs: number, toMs: number): number {
  let total = 0;
  for (const entry of journal) {
    if (entry.ref_type !== 'brokers_fee' || entry.amount === undefined) continue;
    const at = Date.parse(entry.date);
    if (at < fromMs || at > toMs) continue;
    total += Math.abs(entry.amount);
  }
  return total;
}
