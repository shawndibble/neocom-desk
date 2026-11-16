/**
 * The problems the Tax tab hands the Resolve dialog, built from what the member's books say
 * (resolving in the app). Pure: the tab and its attention strip call these.
 */
import type { ClaimedTransfer } from '@/engine/corpTaxBook/overdue';
import type { BookRowView, UncreditedDonation } from '@/engine/corpTaxBook/personal';
import { dayKey, uncreditedKey } from './notPaying';
import type { ResolveProblem } from './outcomes';

export interface ResolveTarget {
  problem: ResolveProblem;
  /** What "Not paying" hides it under. */
  hideKey: string;
  /** "I already paid": the member's own journal transfers. */
  transfers?: ClaimedTransfer[];
  /** A Conflict day: the Payee the member's own entry gave the ore to. */
  payeeName?: string;
  /** Uncredited donations, for the facts. */
  donations?: readonly UncreditedDonation[];
}

/** A book's uncredited donations: the days they paid, the Statement to declare on, the proof. */
export function uncreditedTarget(
  group: readonly (UncreditedDonation & { corporationId: number; corpName: string })[],
  rows: readonly BookRowView[]
): ResolveTarget {
  const [first] = group;
  const days = rows
    .filter(
      (r) =>
        r.corporationId === first.corporationId &&
        group.some((u) => u.characterId === r.characterId && u.covered.includes(r.date))
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const statementId = days.find((r) => r.statementId !== undefined)?.statementId;
  return {
    problem: {
      kind: 'uncredited',
      corporationId: first.corporationId,
      corpName: first.corpName,
      characterId: first.characterId,
      amount: group.reduce((sum, u) => sum + u.amount, 0),
      ...(days[0] ? { row: days[0] } : {}),
      ...(statementId !== undefined ? { statementId } : {}),
    },
    hideKey: uncreditedKey(
      first.corporationId,
      group.map((u) => u.at)
    ),
    transfers: group.flatMap((u) =>
      u.refId === undefined
        ? []
        : [{ amount: u.amount, at: u.at, journalRef: u.refId, recipient: 'corporation' as const }]
    ),
    donations: group,
  };
}

const of = (row: BookRowView) => ({
  corporationId: row.corporationId,
  corpName: row.corpName,
  characterId: row.characterId,
  row,
});
const keyOf = (row: BookRowView) => dayKey(row.corporationId, row.characterId, row.date);

/** Whether the book bills more than the member's record: the case worth disputing. */
export function bookAsksMore(row: BookRowView): boolean {
  const d = row.dispute;
  if (!d || (d.quantity && d.rate)) return true;
  return d.rate ? d.bookPct > (d.personalPct ?? d.bookPct) : d.bookQuantity > d.personalQuantity;
}

/** A billed day whose figures differ from the member's own record. */
export const figureTarget = (row: BookRowView): ResolveTarget => ({
  problem: { ...of(row), kind: 'figure', bookAsksMore: bookAsksMore(row) },
  hideKey: keyOf(row),
});

/** A Conflict day: ore the member gave another Payee that the book also recorded. */
export const conflictTarget = (row: BookRowView, payeeName?: string): ResolveTarget => ({
  problem: { ...of(row), kind: 'conflict' },
  hideKey: keyOf(row),
  ...(payeeName !== undefined ? { payeeName } : {}),
});

/** A day an officer kept the bill on, with what to do next. */
export const keptTarget = (row: BookRowView): ResolveTarget => ({
  problem: {
    ...of(row),
    kind: 'kept',
    by: 'dispute',
    ...(row.flagged?.nextStep !== undefined ? { nextStep: row.flagged.nextStep } : {}),
    ...(row.flagged?.reason !== undefined ? { reason: row.flagged.reason } : {}),
  },
  hideKey: keyOf(row),
});
