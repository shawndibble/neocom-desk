/**
 * A Miner's billable lines (D4, #6294): every Billable day charge of theirs and every officer
 * Adjustment, priced as the charge prices it. A Running account bills them as its days, and a
 * late notice keeps the ones it asked for, as they were priced (`LateNoticeLine`). A dismissed
 * day bills nothing; it is listed so a screen can say who dismissed it.
 */
import { lineKey, type LateNoticeLine } from '../../../functions/src/corpTaxBookLateNotice';
import type { Adjustment } from './adjustments';
import type { DayCharge } from './charges';
import { activeDismissalFor, type Dismissal } from './dismissals';

/** One line a Miner's account bills: a mined day charge, or an Adjustment (`correction`). */
export type BillableLine = LateNoticeLine;

export interface BillableLines {
  /** Oldest first, then by key. */
  lines: BillableLine[];
  /** The Billable day charges an active dismissal keeps off the account. */
  dismissed: { charge: DayCharge; dismissal: Dismissal }[];
}

export function minerBillableLines(input: {
  minerId: string;
  /** The book's start date: earlier mining owes nothing. */
  startDate: string;
  /** Day charges; only this Miner's are used. */
  charges: readonly DayCharge[];
  adjustments: readonly Adjustment[];
  dismissals: readonly Dismissal[];
  /** The Miner's last Billable day; undefined bills nothing. */
  billableThrough: string | undefined;
}): BillableLines {
  const { minerId, billableThrough } = input;
  const out: BillableLines = { lines: [], dismissed: [] };
  if (billableThrough === undefined) return out;
  for (const charge of input.charges) {
    if (charge.minerId !== minerId || charge.date > billableThrough) continue;
    if (charge.date < input.startDate || charge.oreLines.length === 0) continue;
    const dismissal = activeDismissalFor(charge, input.dismissals);
    if (dismissal) {
      out.dismissed.push({ charge, dismissal });
      continue;
    }
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
      key: lineKey({ adjustmentId: adj.id, date: adj.date }),
      oreLines: [],
      estimatedValue: 0,
      tax: adj.amount,
      reason: adj.reason,
    });
  }
  out.lines.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  return out;
}

/** Whether every ore line of a line was priced at the hub's saved close-of-day price. */
export function savedPrice(line: Pick<BillableLine, 'kind' | 'priceSources'>): boolean {
  return (
    line.kind === 'correction' ||
    (line.priceSources !== undefined &&
      Object.values(line.priceSources).every((x) => x === 'saved'))
  );
}
