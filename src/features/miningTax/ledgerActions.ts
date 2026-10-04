/**
 * The Mining Tax ledger's write actions, in the terms the pilot uses: assign,
 * combine, continue a session (and undo it), unassign, accept a new total,
 * take out of combined, settle, split, dismiss, edit an entry, move to another
 * Payee, link or unlink a transaction.
 *
 * Every action is one Dexie transaction over the Assignments and the
 * tombstones their deletes leave, so a multi-record change — every day of a
 * Combined Entry, or an undo that both deletes and un-combines — lands whole
 * or not at all. That is what keeps the Combined Entry rule (one obligation,
 * one Payee, one rate) true on write; `coalesce.ts` repairing it on load is
 * only a safety net for data written before this. The sync is scheduled once
 * per character after the commit, never inside the transaction.
 *
 * Every action resolves (never rejects) to one `LedgerActionResult`, so every
 * caller handles a failure the same way — see `useLedgerAction`. The record
 * primitives in `assignments.ts` are this module's to call; the UI imports
 * actions from here (an ESLint rule holds that line).
 */
import { db, type MiningTaxAssignmentRecord } from '@/db';
import { scheduleSync } from '@/sync';
import type { MiningTaxPaymentLinkSource } from '@/db';
import {
  AlreadyAssignedError,
  createAssignment,
  deleteAssignments,
  dismissEntries,
  joinAssignments,
  linkPaymentTransaction,
  linkRecordedPayment as linkRecordedPaymentRecords,
  markAssignmentsPaid,
  moveAssignmentsToPayee,
  planNeedsReviewResolution,
  splitAssignment,
  uncombineAssignments,
  unlinkPaymentTransaction,
  updateCombinedAssignments,
  type AssignInput,
  type DismissInput,
  type FallbackPaymentInput,
  type JoinMemberInput,
  type PaymentInput,
  type PaymentTransactionRef,
  type SplitInput,
  type SplitPrices,
  type UpdateCombinedInput,
} from './assignments';
import type { GroupMember } from './groupRows';
import type { SessionContinuation } from './sessionContinuation';

export type {
  AssignInput,
  CombinedMemberValues,
  DismissInput,
  FallbackPaymentInput,
  JoinMemberInput,
  PaymentInput,
  PaymentTransactionRef,
  SplitInput,
  SplitPrices,
  UpdateCombinedInput,
} from './assignments';
export { assignmentsSharingPayment } from './assignments';

/**
 * Why an action wrote nothing. `already-assigned`: the pilot's view was stale
 * (another tab or device claimed that ore first), so the answer is to reload
 * and show what exists. `save-failed`: anything else — the write, or the
 * pricing it needed first, failed and nothing changed.
 */
export type LedgerFailureReason = 'already-assigned' | 'save-failed';

export interface LedgerActionFailure {
  ok: false;
  reason: LedgerFailureReason;
  cause: unknown;
}

export type LedgerActionResult<T = void> = { ok: true; value: T } | LedgerActionFailure;

function failure(cause: unknown): LedgerActionFailure {
  return {
    ok: false,
    reason: cause instanceof AlreadyAssignedError ? 'already-assigned' : 'save-failed',
    cause,
  };
}

/**
 * Runs `write` as one transaction, then schedules a sync for each character
 * it touched. `write` may only await Dexie — anything else (a price fetch)
 * belongs before this call, or Dexie commits early (PrematureCommitError).
 */
async function commit<T>(
  characterIds: Iterable<number>,
  write: () => Promise<T>
): Promise<LedgerActionResult<T>> {
  let value: T;
  try {
    value = await db.transaction('rw', db.miningTaxAssignments, db.settings, write);
  } catch (cause) {
    return failure(cause);
  }
  for (const characterId of new Set(characterIds)) scheduleSync(characterId);
  return { ok: true, value };
}

const charactersOf = (records: readonly { characterId: number }[]) =>
  records.map((r) => r.characterId);

/** Assigns an entry's ore (or a slice of it) to a Payee. */
export function assign(input: AssignInput): Promise<LedgerActionResult<MiningTaxAssignmentRecord>> {
  return commit([input.characterId], () => createAssignment(input));
}

/** Combines 2+ entries into one Combined Entry — see `joinAssignments`. */
export function combine(
  members: readonly JoinMemberInput[],
  payeeId: string,
  taxPct: number,
  pricesOn: (date: string) => ReadonlyMap<number, number>
): Promise<LedgerActionResult<MiningTaxAssignmentRecord[]>> {
  return commit(charactersOf(members), () => joinAssignments(members, payeeId, taxPct, pricesOn));
}

/** Everything `undoContinue` needs to take a continue back, and nothing stale. */
export interface ContinueReceipt {
  characterId: number;
  /** The next day's Assignment the continue created. */
  createdId: string;
  /** The previous day's Assignment it combined with. */
  previousId: string;
  /** Whether the previous day was already in a Combined Entry — if so, undo leaves it there. */
  previousWasCombined: boolean;
}

/**
 * "Continue the <date> session": assigns the next day's unassigned ore to the
 * previous day's Payee and rate, and combines the two (or adds it to the
 * Combined Entry the previous day is already in). The next day is priced at
 * that Payee's hub, through `pricesOn`.
 */
export async function continueSession(
  continuation: SessionContinuation,
  pricesOn: (date: string) => ReadonlyMap<number, number>
): Promise<LedgerActionResult<ContinueReceipt>> {
  const { previous, next, payeeId } = continuation;
  const result = await combine(
    [
      {
        characterId: previous.characterId,
        date: previous.date,
        solarSystemId: previous.solarSystemId,
        assignment: previous,
      },
      {
        characterId: next.row.characterId,
        date: next.row.entry.date,
        solarSystemId: next.row.entry.solarSystemId,
        assignment: null,
        oreLines: next.row.unassignedOreLines,
        entryOreLines: next.row.entry.oreLines,
      },
    ],
    payeeId,
    previous.taxPct,
    pricesOn
  );
  if (!result.ok) return result;
  const created = result.value.find((r) => r.id !== previous.id)!;
  return {
    ok: true,
    value: {
      characterId: previous.characterId,
      createdId: created.id,
      previousId: previous.id,
      previousWasCombined: previous.groupId !== undefined,
    },
  };
}

/**
 * Takes a continue back: unassigns the day it added and, when the previous
 * day stood alone before, un-combines it again. Both records are re-read
 * inside the transaction, so a reload that changed them since (absorbed
 * growth, say) is kept rather than overwritten by the copy from before.
 */
export function undoContinue(receipt: ContinueReceipt): Promise<LedgerActionResult> {
  return commit([receipt.characterId], async () => {
    const created = await db.miningTaxAssignments.get(receipt.createdId);
    if (created) await deleteAssignments([created]);
    if (receipt.previousWasCombined) return;
    const previous = await db.miningTaxAssignments.get(receipt.previousId);
    if (previous) await uncombineAssignments([previous]);
  });
}

/** Dismisses entries ("I don't pay tax on this"), one row's or a bulk selection's. */
export function dismiss(
  inputs: readonly DismissInput[]
): Promise<LedgerActionResult<MiningTaxAssignmentRecord[]>> {
  return commit(charactersOf(inputs), () => dismissEntries(inputs));
}

/** Saves an entry's edit form — one Payee and rate for every day of it. */
export function editEntry(
  assignments: readonly MiningTaxAssignmentRecord[],
  input: UpdateCombinedInput
): Promise<LedgerActionResult<MiningTaxAssignmentRecord[]>> {
  return commit(charactersOf(assignments), () => updateCombinedAssignments(assignments, input));
}

/** "Take out of combined" for one day, or "Uncombine all" for every day. */
export function uncombine(
  assignments: readonly MiningTaxAssignmentRecord[]
): Promise<LedgerActionResult> {
  return commit(charactersOf(assignments), () => uncombineAssignments(assignments));
}

/** Unassigns one Assignment (or undoes a dismissal), or every day of a Combined Entry together. */
export function unassign(
  assignments: readonly MiningTaxAssignmentRecord[]
): Promise<LedgerActionResult> {
  return commit(charactersOf(assignments), () => deleteAssignments(assignments));
}

/**
 * "Accept new total" for one grown day or every grown day of a Combined
 * Entry. Each is priced first — a fetch, so outside the transaction — and
 * only when all of them priced are they written, together.
 */
export async function acceptNewTotal(members: readonly GroupMember[]): Promise<LedgerActionResult> {
  let resolved: MiningTaxAssignmentRecord[];
  try {
    resolved = await Promise.all(
      members.map((m) => planNeedsReviewResolution(m.assignment, m.row.entry, m.row.assignments))
    );
  } catch (cause) {
    return failure(cause);
  }
  return commit(charactersOf(resolved), async () => {
    if (resolved.length > 0) await db.miningTaxAssignments.bulkPut(resolved);
  });
}

/** Marks Assignments paid — a row's "mark paid", or Settle-up with the payment it recorded. */
export function settle(
  assignments: readonly MiningTaxAssignmentRecord[],
  payment?: PaymentInput
): Promise<LedgerActionResult> {
  return commit(charactersOf(assignments), () => markAssignmentsPaid(assignments, payment));
}

/** Splits part of one assigned day over to a second Payee. */
export function split(
  original: MiningTaxAssignmentRecord,
  input: SplitInput,
  prices: SplitPrices
): Promise<
  LedgerActionResult<{ kept: MiningTaxAssignmentRecord; created: MiningTaxAssignmentRecord }>
> {
  return commit([original.characterId], () => splitAssignment(original, input, prices));
}

/** Moves a deleted Payee's Assignments to another Payee. */
export function moveToPayee(
  assignments: readonly MiningTaxAssignmentRecord[],
  payeeId: string
): Promise<LedgerActionResult> {
  return commit(charactersOf(assignments), () => moveAssignmentsToPayee(assignments, payeeId));
}

/** The manual "Link transaction" — see `linkPaymentTransaction`. */
export function linkTransaction(
  assignments: readonly MiningTaxAssignmentRecord[],
  ref: PaymentTransactionRef,
  source: MiningTaxPaymentLinkSource,
  fallbackPayment: FallbackPaymentInput
): Promise<LedgerActionResult> {
  return commit(charactersOf(assignments), () =>
    linkPaymentTransaction(assignments, ref, source, fallbackPayment)
  );
}

/** Removes one linked transaction (a mistaken pick). */
export function unlinkTransaction(
  assignments: readonly MiningTaxAssignmentRecord[],
  ref: PaymentTransactionRef
): Promise<LedgerActionResult> {
  return commit(charactersOf(assignments), () => unlinkPaymentTransaction(assignments, ref));
}

/** Attaches an auto-matched transaction to a recorded Settle-up payment. */
export function linkRecordedPayment(
  assignments: readonly MiningTaxAssignmentRecord[],
  ref: PaymentTransactionRef
): Promise<LedgerActionResult> {
  return commit(charactersOf(assignments), () => linkRecordedPaymentRecords(assignments, ref));
}
