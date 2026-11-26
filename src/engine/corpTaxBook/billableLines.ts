import {
  adjustmentLineKey,
  type LateNoticeLine,
} from '../../../functions/src/corpTaxBookLateNotice';
import type { Adjustment } from './adjustments';
import type { DayCharge } from './charges';
import { activeDismissalFor, type Dismissal } from './dismissals';

export type BillableLine = LateNoticeLine;

export interface BillableLines {
  lines: BillableLine[];
}

export function minerBillableLines(input: {
  minerId: string;
  startDate: string;
  charges: readonly DayCharge[];
  adjustments: readonly Adjustment[];
  dismissals: readonly Dismissal[];
  billableThrough: string | undefined;
}): BillableLines {
  const { minerId, billableThrough } = input;
  const out: BillableLines = { lines: [] };
  if (billableThrough === undefined) return out;
  for (const charge of input.charges) {
    if (charge.minerId !== minerId || charge.date > billableThrough) continue;
    if (charge.date < input.startDate || charge.oreLines.length === 0) continue;
    if (activeDismissalFor(charge, input.dismissals)) continue;
    out.lines.push({
      kind: 'mined',
      date: charge.date,
      key: charge.key,
      characterId: charge.characterId,
      structureId: charge.structureId,
      oreLines: charge.oreLines,
      unitPrices: charge.unitPrices,
      priceSources: charge.priceSources,
      taxPct: charge.taxPct,
      ...(charge.rateEffectiveFrom !== undefined
        ? { rateEffectiveFrom: charge.rateEffectiveFrom }
        : {}),
      estimatedValue: charge.estimatedValue,
      tax: charge.taxOwed,
    });
  }
  for (const adj of input.adjustments) {
    if (adj.minerId !== minerId || adj.reversed || adj.date > billableThrough) continue;
    out.lines.push({
      kind: 'correction',
      date: adj.date,
      key: adjustmentLineKey(adj.id),
      oreLines: [],
      estimatedValue: 0,
      tax: adj.amount,
      reason: adj.reason,
    });
  }
  out.lines.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  return out;
}

export function savedPrice(line: Pick<BillableLine, 'kind' | 'priceSources'>): boolean {
  return (
    line.kind === 'correction' ||
    (line.priceSources !== undefined &&
      Object.values(line.priceSources).every((x) => x === 'saved'))
  );
}
