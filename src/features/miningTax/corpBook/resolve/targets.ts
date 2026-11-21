/**
 * The problems the Tax tab hands the Resolve dialog, built from what the member's books say
 * (resolving in the app). Pure: the tab and its attention strip call these.
 */
import type { ClaimedTransfer } from '@/engine/corpTaxBook/overdue';
import type {
  BookRowView,
  MemberDeclaration,
  UncreditedDonation,
} from '@/engine/corpTaxBook/personal';
import { characterIdsOfMiner, minerIdFor, type Miner } from '@/engine/corpTaxBook/charges';
import type { LegacyStatementDoc as Statement } from '@/engine/corpTaxBook/legacyStatementDoc';
import {
  keptDayKey,
  keptStatementKey,
  notPayingDayKey,
  statementKey,
  uncreditedKey,
} from './notPaying';
import { notOwedPlan, type ResolveProblem } from './outcomes';
import type { InReviewPayment } from '../corpBookStore';

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
  /** A declaration an officer rejected, read word for word with the problem it is about. */
  declaration?: MemberDeclaration;
  /**
   * The member has already told the corporation (a declaration waits on the Statement the days are
   * on): the problem leaves the attention list until an officer answers (decision 20261116-194150).
   */
  answered?: boolean;
  /** The first day the member's own payments could be for (ISO): the "which payment" picker starts here. */
  paidSince?: string;
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
  const coveredDays = [...new Set(group.flatMap((u) => u.covered))].sort();
  return {
    // Waiting on the corporation, or an officer's answer already on the strip as a kept bill.
    answered: days.some((r) => r.declaration?.state === 'waiting' || keptBy(r) === 'declaration'),
    problem: {
      kind: 'uncredited',
      corporationId: first.corporationId,
      corpName: first.corpName,
      characterId: first.characterId,
      amount: group.reduce((sum, u) => sum + u.amount, 0),
      ...(days[0] ? { row: days[0] } : {}),
      ...(statementId !== undefined ? { statementId } : {}),
      ...(coveredDays.length > 0 ? { days: coveredDays } : {}),
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

/**
 * A book's donations it holds for review without counting them (#6207): the member says they were
 * tax. With an open Statement of the donor's Miner the proof goes on it (the server credits each
 * held donation it finds, and an officer sees the declaration); without one each is claimed.
 */
export function inReviewTarget(group: {
  corporationId: number;
  corpName: string;
  donations: readonly InReviewPayment[];
  statementId?: string;
}): ResolveTarget {
  const { donations } = group;
  return {
    problem: {
      kind: 'uncredited',
      corporationId: group.corporationId,
      corpName: group.corpName,
      characterId: donations[0].characterId,
      amount: donations.reduce((sum, d) => sum + d.amount, 0),
      ...(group.statementId !== undefined ? { statementId: group.statementId } : {}),
      held: donations.map((d) => ({ id: d.id, characterId: d.characterId })),
    },
    hideKey: uncreditedKey(
      group.corporationId,
      donations.map((d) => d.at)
    ),
    transfers: donations.flatMap((d) =>
      d.refId === undefined
        ? []
        : [{ amount: d.amount, at: d.at, journalRef: d.refId, recipient: 'corporation' as const }]
    ),
    donations: donations.map((d) => ({
      characterId: d.characterId,
      amount: d.amount,
      at: d.at,
      ...(d.refId !== undefined ? { refId: d.refId } : {}),
      covered: [],
    })),
  };
}

const of = (row: BookRowView) => ({
  corporationId: row.corporationId,
  corpName: row.corpName,
  characterId: row.characterId,
  row,
});
const keyOf = (row: BookRowView) => notPayingDayKey(row.corporationId, row.characterId, row.date);

/** Whether the book bills more than the member's record: the case worth disputing. */
export function bookAsksMore(row: BookRowView): boolean {
  const d = row.dispute;
  if (!d || (d.quantity && d.rate)) return true;
  return d.rate ? d.bookPct > (d.personalPct ?? d.bookPct) : d.bookQuantity > d.personalQuantity;
}

/**
 * Whether a day still bills the member: a Billed or Conflict day, or one the member marked paid
 * that the book still shows owed. A day since paid has nothing left to keep.
 */
const stillOwed = (row: BookRowView) =>
  row.state === 'billed' || row.state === 'conflict' || row.bookOwed !== undefined;

/**
 * What an officer kept on a day, if it is still owed: their rejection of the member's dispute of
 * the day, or of the declaration on its Statement. A dispute leads when both are.
 */
export function keptBy(row: BookRowView): 'dispute' | 'declaration' | undefined {
  if (!stillOwed(row)) return undefined;
  if (row.flagged?.state === 'rejected') return 'dispute';
  if (row.declaration?.state === 'rejected' && row.statementId !== undefined) return 'declaration';
  return undefined;
}

/** A billed day whose figures differ from the member's own record. */
export const figureTarget = (row: BookRowView): ResolveTarget => ({
  problem: { ...of(row), kind: 'figure', bookAsksMore: bookAsksMore(row) },
  hideKey: keyOf(row),
});

/**
 * Whether a billed day's figure strip item is worth showing: the book bills MORE than the
 * member's record and there is a dispute to send. Billing less leaves nothing to raise.
 */
export const figureNeedsAnswer = (row: BookRowView): boolean =>
  row.state === 'billed' &&
  row.dispute !== undefined &&
  row.flagged === undefined &&
  bookAsksMore(row) &&
  notOwedPlan(row) !== undefined;

/** A Conflict day: ore the member gave another Payee that the book also recorded. */
export const conflictTarget = (row: BookRowView, payeeName?: string): ResolveTarget => ({
  problem: { ...of(row), kind: 'conflict' },
  hideKey: keyOf(row),
  ...(payeeName !== undefined ? { payeeName } : {}),
});

/** The key "Not paying" hides an officer's answer on a day under: it names the answer's time. */
function keptHideKey(row: BookRowView, by: 'dispute' | 'declaration'): string {
  const said = by === 'dispute' ? row.flagged : row.declaration;
  const at = said?.at ?? '';
  return by === 'declaration' && row.statementId !== undefined
    ? keptStatementKey(row.corporationId, row.statementId, at)
    : keptDayKey(row.corporationId, row.characterId, row.date, at);
}

/**
 * Whether the member's "Not paying" currently applies to a book day: it hides what they said no
 * to, not an officer's later answer (`kept…` keys name the answer's time), and it reads the same
 * for a Billed, Conflict, Overdue-Statement or uncredited-donation day.
 */
export function notPayingHides(hidden: ReadonlySet<string>, row: BookRowView): boolean {
  if (hidden.size === 0) return false;
  const by = keptBy(row);
  if (by) return hidden.has(keptHideKey(row, by));
  if (row.state !== 'billed' && row.state !== 'conflict') return false;
  if (hidden.has(keyOf(row))) return true;
  if (row.statementId !== undefined && hidden.has(statementKey(row.corporationId, row.statementId)))
    return true;
  const sent = row.unlinkedDonation?.at;
  if (sent === undefined) return false;
  const prefix = `uncredited:${row.corporationId}:`;
  for (const key of hidden)
    if (key.startsWith(prefix) && key.slice(prefix.length).split(',').includes(sent)) return true;
  return false;
}

/**
 * The Characters whose payments the server accepts as proof for a Statement (its senders): the
 * Characters on the Miner the Statement bills, or on the book's Miner of the day's Character.
 */
export function proofSenders(
  book: { statements: readonly Statement[]; miners: readonly Miner[] } | undefined,
  p: { characterId: number; statementId?: string; row?: BookRowView }
): number[] {
  if (!book) return [p.characterId];
  const statementMiner = book.statements.find((s) => s.id === p.statementId)?.minerId;
  const minerId = statementMiner ?? p.row?.minerId ?? minerIdFor(p.characterId, [...book.miners]);
  const ids = characterIdsOfMiner(minerId, book.miners);
  return ids.length > 0 ? ids : [p.characterId];
}

/** A day an officer kept the bill on, with what to do next, word for word. */
export function keptTarget(row: BookRowView, by = keptBy(row) ?? 'dispute'): ResolveTarget {
  const said = by === 'dispute' ? row.flagged : row.declaration;
  const reason = said?.reason;
  const nextStep = said?.nextStep;
  return {
    problem: {
      ...of(row),
      kind: 'kept',
      by,
      ...(nextStep !== undefined ? { nextStep } : {}),
      ...(reason !== undefined ? { reason } : {}),
      ...(row.statementId !== undefined ? { statementId: row.statementId } : {}),
    },
    // Keyed on the officer's answer: hiding it hides that answer only, a later one shows again.
    hideKey: keptHideKey(row, by),
    paidSince: row.date,
  };
}

/** A Statement past its due date: pay it, say you paid it, or stop being reminded. */
export function overdueTarget(o: {
  corporationId: number;
  corpName: string;
  statementId: string;
  characterId: number;
  periodStart: string;
  period: string;
  declaration?: MemberDeclaration;
  /** A recorded day of the Statement: what "Not paying" tells the corporation about. */
  row?: BookRowView;
}): ResolveTarget {
  return {
    problem: {
      kind: 'overdue',
      corporationId: o.corporationId,
      corpName: o.corpName,
      characterId: o.characterId,
      statementId: o.statementId,
      period: o.period,
      ...(o.row ? { row: o.row } : {}),
    },
    // A rejected declaration is an officer's answer: hiding it hides that answer only.
    hideKey:
      o.declaration?.state === 'rejected'
        ? keptStatementKey(o.corporationId, o.statementId, o.declaration.at)
        : statementKey(o.corporationId, o.statementId),
    paidSince: o.periodStart,
    ...(o.declaration?.state === 'rejected' ? { declaration: o.declaration } : {}),
  };
}

/**
 * A donation the book never credited paid this day: the "which payment was it?" picker finds
 * it in the wallet journal. Absent on a day with no such donation.
 */
export function unlinkedTarget(row: BookRowView): ResolveTarget | undefined {
  if (!row.unlinkedDonation) return undefined;
  return uncreditedTarget(
    [
      {
        ...row.unlinkedDonation,
        corporationId: row.corporationId,
        corpName: row.corpName,
        characterId: row.characterId,
        covered: [row.date],
      },
    ],
    [row]
  );
}

/** A day the member marked paid that the book's Statement still bills: pay, send proof, or not paying. */
export const markedPaidTarget = (row: BookRowView): ResolveTarget => ({
  problem: {
    ...of(row),
    kind: 'markedPaid',
    ...(row.statementId !== undefined ? { statementId: row.statementId } : {}),
  },
  hideKey: keyOf(row),
  paidSince: row.date,
});

/** A plain billed day nothing is wrong with: pay it, or stop being reminded. */
export const billedTarget = (row: BookRowView): ResolveTarget => ({
  problem: { ...of(row), kind: 'billed' },
  hideKey: keyOf(row),
});

/**
 * The Resolve a book day's own row offers, for the row detail's Resolve button: the day an
 * officer kept, a Conflict, or a Billed day whose figure differs; none for a day with nothing
 * to resolve. `payeeName` names the Payee a Conflict's own entry gave the ore to.
 */
export function rowTarget(row: BookRowView, payeeName?: string): ResolveTarget | undefined {
  if (keptBy(row)) return keptTarget(row);
  if (row.state === 'conflict') return conflictTarget(row, payeeName);
  if (row.state === 'billed' && row.dispute !== undefined && row.flagged === undefined)
    return figureTarget(row);
  if (row.state === 'paid' && row.bookOwed !== undefined) return markedPaidTarget(row);
  return row.state === 'billed'
    ? (unlinkedTarget(row) ??
        (row.declaration?.state === 'waiting' ? undefined : billedTarget(row)))
    : undefined;
}
