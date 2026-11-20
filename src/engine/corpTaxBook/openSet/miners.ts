import {
  allocatePayments,
  dismissalCredits,
  isBeforeBook,
  type AllocationInput,
  type TaxPayment,
} from '../allocation';
import type { DayCharge } from '../charges';
import { heldByStatement } from '../disputes';
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
 * under the new grouping. For record, extraction and moon dismissals that matches the server
 * (`dismissalCredits` in `functions/src/corpTaxBookEngine.ts`). Two gaps are older than this
 * module: a `miner` dismissal is checked against the day's current Miner here but against the
 * Statement's Miner on the server, and a billed line whose day has no current charge (no longer
 * readable or rated) gets no credit here. On the member side (`'observed-rows'` placement) a
 * day has no Extraction id, so an extraction dismissal never matches there.
 */
export function settleMiner(
  input: OpenSetInput,
  minerId: string,
  charges: readonly DayCharge[],
  book: { billableThrough: string | undefined; holds: ReadonlyMap<number, StaleHold> }
): MinerSettlement {
  const statements = input.statements.filter((s) => s.minerId === minerId);
  // On a running account a late notice's days are running days (#6294): never Statement debt.
  const billed = input.runningAccount ? statements.filter((s) => s.kind !== 'notice') : statements;
  // A donation before the book is neither credited nor shown as a payment.
  const payments = input.payments.filter(
    (p): p is TaxPayment =>
      p.minerId === minerId && (p.source !== 'donation' || !isBeforeBook(p.at, input.startDate))
  );
  const credits = dismissalCredits(billed, input.dismissals, charges);
  // A member's open dispute holds its amount out of what is due (resolving in the app).
  const held = heldByStatement(
    billed,
    (input.disputes ?? []).filter((d) => d.minerId === minerId),
    new Set(credits.map((c) => `${c.statementId}|${c.chargeKey}`)),
    input.now
  );
  const allocationInput: AllocationInput = {
    statements: billed,
    payments,
    dismissalCredits: credits,
    officerWriteOffs: (input.writeOffs ?? []).filter((w) => w.minerId === minerId && !w.reversed),
    startDate: input.startDate,
    ...(held.size > 0 ? { held } : {}),
  };
  const allocation = allocatePayments(allocationInput);

  const overdue = new Map<string, OverdueStatus>();
  for (const s of billed) {
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
    characterIds,
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
