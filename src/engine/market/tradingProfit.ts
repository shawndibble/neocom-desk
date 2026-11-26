import type { RealizedMargin } from './realizedMargin';
import { parseInstant } from '../esiInstant';

export interface SaleFill {
  transactionId: number;
  date: string;
  typeId: number;
  isBuy: boolean;
}

export interface MarginTotal {
  margin: number;
  matched: number;
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

export interface ItemMargin extends MarginTotal {
  typeId: number;
}

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

export function sumBrokerFees(journal: readonly FeeLine[], fromMs: number, toMs: number): number {
  let total = 0;
  for (const entry of journal) {
    if (entry.ref_type !== 'brokers_fee' || entry.amount === undefined) continue;
    const at = parseInstant(entry.date);
    if (at === null || at < fromMs || at > toMs) continue;
    total += Math.abs(entry.amount);
  }
  return total;
}
