import {
  allocatePayments,
  dismissalCredits,
  isBeforeBook,
  type AllocationInput,
  type TaxPayment,
} from '../allocation';
import type { DayCharge } from '../charges';
import { heldBillableThrough, type StaleHold } from '../feederHealth';
import { overdueStatus, type OverdueStatus } from '../overdue';
import type { MinerSettlement, OpenSetInput } from './types';

/** The Miner ids a book lists, in order: groupings, then the ids days, Statements and payments name. */
export function minerIdsOf(input: OpenSetInput, charges: readonly DayCharge[]): string[] {
  const ids = new Set<string>(input.miners.map((m) => m.id));
  for (const c of charges) ids.add(c.minerId);
  for (const s of input.statements) ids.add(s.minerId);
  for (const p of input.payments) if (p.minerId) ids.add(p.minerId);
  return [...ids];
}

/** A Miner's characters: its grouping's, or the one a `solo:` id names. */
function characterIdsOf(input: OpenSetInput, minerId: string): number[] {
  const grouping = input.miners.find((m) => m.id === minerId);
  const solo = /^solo:(\d+)$/.exec(minerId);
  return grouping?.characterIds ?? (solo ? [Number(solo[1])] : []);
}

/**
 * One Miner's payments against its Statements (D5/D15), oldest first, after dismissal credits
 * and officer write-offs; then each unsettled Statement's Overdue clock.
 *
 * Dismissal credits look a billed line's day up among every charge, not only the ones now
 * under this Miner: after a regroup an absorbed Miner's Statements still bill days that sit
 * under the new grouping, and a dismissal of one of them still credits the Statement.
 */
export function settleMiner(
  input: OpenSetInput,
  minerId: string,
  charges: readonly DayCharge[],
  book: { billableThrough: string | undefined; holds: ReadonlyMap<number, StaleHold> }
): MinerSettlement {
  const statements = input.statements.filter((s) => s.minerId === minerId);
  // A donation before the book is neither credited nor shown as a payment.
  const payments = input.payments.filter(
    (p): p is TaxPayment =>
      p.minerId === minerId && (p.source !== 'donation' || !isBeforeBook(p.at, input.startDate))
  );
  const credits = dismissalCredits(statements, input.dismissals, charges);
  const allocationInput: AllocationInput = {
    statements,
    payments,
    dismissalCredits: credits,
    officerWriteOffs: (input.writeOffs ?? []).filter((w) => w.minerId === minerId),
    startDate: input.startDate,
  };
  const allocation = allocatePayments(allocationInput);

  const overdue = new Map<string, OverdueStatus>();
  for (const s of statements) {
    if (allocation.byStatement.get(s.id)?.settled) continue;
    overdue.set(
      s.id,
      overdueStatus({
        issuedAt: s.issuedAt,
        settled: false,
        now: input.now,
        declarations: (input.declarations ?? []).filter((d) => d.statementId === s.id),
        ...(input.overdueDays !== undefined ? { overdueDays: input.overdueDays } : {}),
      })
    );
  }

  const characterIds = characterIdsOf(input, minerId);
  const hold = characterIds
    .map((cid) => book.holds.get(cid))
    .filter((h) => h !== undefined)
    .sort((a, b) => a.from.localeCompare(b.from))[0];
  return {
    statements,
    payments,
    dismissalCredits: credits,
    allocationInput,
    allocation,
    overdue,
    billableThrough: heldBillableThrough(book.billableThrough, characterIds, book.holds),
    ...(hold ? { hold } : {}),
  };
}
