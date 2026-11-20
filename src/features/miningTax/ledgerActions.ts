/**
 * The Mining Tax ledger's write actions, in the terms the pilot uses: assign,
 * combine, continue a session (and undo it), unassign, accept a new total,
 * take out of combined, settle, split, dismiss, edit an entry, delete a Payee
 * (moving its entries to another), link or unlink a transaction.
 *
 * Every action is one Dexie transaction over the Assignments, the Payees
 * (for deleting one) and the tombstones their deletes leave, so a multi-record change — every day of a
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
import {
  db,
  type MiningTaxAssignmentRecord,
  type MiningTaxOreLine,
  type MiningTaxPaymentLinkSource,
  type PayeeRecord,
} from '@/db';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import { minusLines, priceMap } from '@/engine/miningTax/oreLines';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { scheduleSync } from '@/sync';
import {
  AlreadyAssignedError,
  createAssignment,
  deleteAssignments,
  dismissEntries,
  joinAssignments,
  linkPaymentTransaction,
  linkRecordedPayment as linkRecordedPaymentPrimitive,
  markAssignmentsPaid,
  moveAssignmentsToPayee,
  planNeedsReviewResolution,
  loadReleasePrices,
  releaseOreFromAssignment,
  type ReleasePrices,
  splitAssignment,
  uncombineAssignments,
  unmarkAssignmentsPaid,
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
import { recordDefaultOptOuts } from './defaultOptOuts';
import type { GroupMember } from './groupRows';
import { payeesOfBookCorporation } from '@/engine/miningTax/payeeCorporation';
import { removePayeeRecord, withCorporationLink } from './payees';
import { amountSlack } from './paymentMatches';
import { wherePaymentGoes } from './corpBook/paymentLanding';
import { allocateOldestFirst } from './settleAllocation';
import type { SessionContinuation } from './sessionContinuation';

export type {
  AssignInput,
  CombinedMemberValues,
  DismissInput,
  FallbackPaymentInput,
  JoinMemberInput,
  PaymentInput,
  PaymentTransactionRef,
  SplitCollector,
  SplitInput,
  SplitPrices,
  UpdateCombinedInput,
} from './assignments';
export { assignmentsSharingPayment } from './assignments';

/**
 * Why an action wrote nothing. `already-assigned`: the pilot's view was stale
 * (another tab or device claimed that ore first), so the answer is to reload
 * and show what exists. `held-elsewhere`: a Corp Tax Book Settle up would claim ore the ledger
 * already holds elsewhere (`HeldElsewhereError`), so the pilot sorts those rows out first.
 * `save-failed`: anything else — the write, or the
 * pricing it needed first, failed and nothing changed.
 */
export type LedgerFailureReason = 'already-assigned' | 'held-elsewhere' | 'save-failed';

export interface LedgerActionFailure {
  ok: false;
  reason: LedgerFailureReason;
  cause: unknown;
}

export type LedgerActionResult<T = void> = { ok: true; value: T } | LedgerActionFailure;

/**
 * Thrown by `recordCorpPayment` when a ticked book row's ore is already held elsewhere in the
 * member's ledger: another Payee's Assignment, a dismissal, or their own corp Assignment waiting
 * on Needs review. Recording it would claim that ore twice, so nothing is written and the dialog
 * names the rows instead of closing.
 */
export class HeldElsewhereError extends Error {
  constructor(readonly rows: readonly { id: string; date: string }[]) {
    super('Book rows hold ore the ledger already assigns elsewhere');
    this.name = 'HeldElsewhereError';
  }
}

function failure(cause: unknown): LedgerActionFailure {
  return {
    ok: false,
    reason:
      cause instanceof AlreadyAssignedError
        ? 'already-assigned'
        : cause instanceof HeldElsewhereError
          ? 'held-elsewhere'
          : 'save-failed',
    cause,
  };
}

/**
 * Runs `write` as one transaction, then schedules a sync for each character
 * it touched — given up front, or worked out from what `write` returned when
 * only the transaction knows. `write` may only await Dexie — anything else (a price fetch)
 * belongs before this call, or Dexie commits early (PrematureCommitError).
 */
async function commit<T>(
  characterIds: Iterable<number> | ((value: T) => Iterable<number>),
  write: () => Promise<T>
): Promise<LedgerActionResult<T>> {
  let value: T;
  try {
    value = await db.transaction('rw', db.miningTaxAssignments, db.payees, db.settings, write);
  } catch (cause) {
    return failure(cause);
  }
  const touched = typeof characterIds === 'function' ? characterIds(value) : characterIds;
  for (const characterId of new Set(touched))
    scheduleSync(characterId, { collections: ['miningTaxAssignments', 'payees'] });
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
export async function unassign(
  assignments: readonly MiningTaxAssignmentRecord[]
): Promise<LedgerActionResult> {
  const result = await commit(charactersOf(assignments), () => deleteAssignments(assignments));
  // Unassign sticks: a Payee's Default Systems must not assign the entry again. Written after
  // the commit (the synced setting is not Dexie-only); a failure here only means the default may
  // try once more, so it never undoes the unassign.
  if (result.ok) await recordDefaultOptOuts(assignments).catch(() => undefined);
  return result;
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

/** Undoes "mark paid": the Assignments go back to owed, and their payment record with them. */
export function unsettle(
  assignments: readonly MiningTaxAssignmentRecord[]
): Promise<LedgerActionResult> {
  return commit(charactersOf(assignments), () => unmarkAssignmentsPaid(assignments));
}

/**
 * `unsettle` for a caller that holds only ids: a Corp Tax Book row stands in for the member's own
 * paid marks, and the book rows are not among the Assignments the screen keeps in memory.
 */
export function unsettleByIds(
  ids: readonly string[]
): Promise<LedgerActionResult<MiningTaxAssignmentRecord[]>> {
  return commit(
    (found: MiningTaxAssignmentRecord[]) => charactersOf(found),
    async () => {
      const found = (await db.miningTaxAssignments.bulkGet([...ids])).filter(
        (a): a is MiningTaxAssignmentRecord => a !== undefined
      );
      if (found.length === 0) throw new Error('No stored Assignment matches the paid marks');
      await unmarkAssignmentsPaid(found);
      return found;
    }
  );
}

/** Takes ore off the miner's own Assignments because the corporation bills it (#4517). */
export async function releaseOre(
  releases: readonly { assignment: MiningTaxAssignmentRecord; after: MiningTaxOreLine[] }[],
  /** True when a Survey connection takes ore off a Default System's Assignment (`surveyConnections.ts`): the rest stays the default's. */
  takeoverFromDefault = false
): Promise<LedgerActionResult> {
  // Priced before the write: pricing reads market data outside the ledger's transaction.
  let priced: ReleasePrices[];
  try {
    priced = await Promise.all(releases.map((r) => loadReleasePrices(r.assignment, r.after)));
  } catch (cause) {
    return failure(cause);
  }
  return commit(charactersOf(releases.map((r) => r.assignment)), async () => {
    for (const [i, r] of releases.entries())
      await releaseOreFromAssignment(r.assignment, r.after, priced[i]!, takeoverFromDefault);
  });
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

/**
 * What deleting `payeeId` with a move takes to the new Payee: its owed days,
 * plus every other day of a Combined Entry one of them is in — paid,
 * dismissed and needs-review days included, because a Combined Entry is one
 * obligation under one Payee and moving only its owed days would split it
 * (and coalesce would then dissolve it on load). Standalone paid days, and
 * Combined Entries with nothing owed, stay with the deleted Payee's history.
 */
export function assignmentsMovedWithPayee(
  assignments: readonly MiningTaxAssignmentRecord[],
  payeeId: string
): MiningTaxAssignmentRecord[] {
  const own = assignments.filter((a) => a.payeeId === payeeId);
  const owedGroups = new Set(
    own.filter((a) => a.status === 'outstanding' && a.groupId !== undefined).map((a) => a.groupId)
  );
  return own.filter(
    (a) => a.status === 'outstanding' || (a.groupId !== undefined && owedGroups.has(a.groupId))
  );
}

/**
 * Deletes a Payee, first moving what `assignmentsMovedWithPayee` picks to
 * `moveToPayeeId` when given — one transaction, so a failure leaves both the
 * Payee and every one of its entries as they were. The entries are re-read
 * inside it, so a day another tab assigned since the dialog opened moves too.
 */
export function deletePayee(
  payee: PayeeRecord,
  moveToPayeeId?: string
): Promise<LedgerActionResult> {
  return commit(
    (moved: MiningTaxAssignmentRecord[]) => [payee.characterId, ...charactersOf(moved)],
    async () => {
      let moved: MiningTaxAssignmentRecord[] = [];
      if (moveToPayeeId !== undefined) {
        // Walks the `characterId` index per character (keys only to find them), not every record.
        const characterIds = await db.miningTaxAssignments.orderBy('characterId').uniqueKeys();
        const own = await db.miningTaxAssignments
          .where('characterId')
          .anyOf(characterIds)
          .filter((a) => a.payeeId === payee.id)
          .toArray();
        moved = assignmentsMovedWithPayee(own, payee.id);
        await moveAssignmentsToPayee(moved, moveToPayeeId);
      }
      await removePayeeRecord(payee);
      return moved;
    }
  ).then((result) => (result.ok ? { ok: true, value: undefined } : result));
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
  return commit(charactersOf(assignments), () => linkRecordedPaymentPrimitive(assignments, ref));
}

/** The character's Payee verified as the corporation: the first one, or a new one named for it. */
async function corpEntityPayeeIds(
  characterId: number,
  corp: { corporationId: number; name: string },
  taxPct: number
): Promise<string[]> {
  const payees = await db.payees.where('characterId').equals(characterId).toArray();
  // Never a second Payee for the corporation: one named as it but missing its link is it, linked now.
  const found = payeesOfBookCorporation(payees, corp);
  for (const f of found.filter((x) => x.link)) {
    const payee = payees.find((p) => p.id === f.id);
    if (payee) await db.payees.put(withCorporationLink(payee, corp.corporationId));
  }
  const ids = found.map((f) => f.id);
  if (ids.length > 0) return ids;
  const id = crypto.randomUUID();
  await db.payees.put({
    id,
    characterId,
    name: corp.name,
    defaultTaxPct: taxPct,
    entityId: corp.corporationId,
    entityKind: 'corporation',
    updatedAt: Date.now(),
  });
  return [id];
}

const entryKeyOf = (r: { characterId: number; date: string; solarSystemId: number }) =>
  `${r.characterId}|${r.date}|${r.solarSystemId}`;

/** One Mining Ledger Entry as `recordCorpPayment` walks its rows: read once, consumed as it goes. */
interface EntryClaims {
  /** The member's own owed Assignments under the corporation's Payee, marked paid with the rows. */
  owedOwn: MiningTaxAssignmentRecord[];
  /** Ore the member's own paid or owed corp Assignments hold that no earlier row has consumed. */
  ownPool: MiningTaxOreLine[];
  /** Ore every stored Assignment on the entry claims, plus what earlier rows recorded, by type. */
  claimed: Map<number, number>;
}

function addClaims(claimed: Map<number, number>, lines: readonly MiningTaxOreLine[]): void {
  for (const l of lines) claimed.set(l.typeId, (claimed.get(l.typeId) ?? 0) + l.quantity);
}

/**
 * Whether `lines` fit beside what the entry already claims — `assertUnclaimed`'s rule, so the
 * write that follows can't be refused: a type nothing claims always fits; a claimed one fits only
 * within the entry's own ore.
 */
function fitsEntry(
  claims: EntryClaims,
  lines: readonly MiningTaxOreLine[],
  entryOreLines: readonly MiningTaxOreLine[] | undefined
): boolean {
  return lines.every((l) => {
    const already = claims.claimed.get(l.typeId) ?? 0;
    if (already === 0) return true;
    const held = entryOreLines?.find((e) => e.typeId === l.typeId)?.quantity;
    return held !== undefined && already + l.quantity <= held;
  });
}

/**
 * The other owed days of every Combined Entry one of `assignments` belongs to, under the same
 * Payee. A Combined Entry is one obligation, so a Corp Tax Book Settle up that reaches one of its
 * days pays them all — paying only that day would leave the entry half paid, and `coalesce` would
 * then dissolve it. A needs-review day stays as it is: its new total is accepted first, the same
 * as any Settle up. A member under another Payee is a stale group `coalesce` ejects, never paid
 * here. A group always shares one character, so each is read by its character.
 */
async function owedCombinedSiblings(
  assignments: readonly MiningTaxAssignmentRecord[]
): Promise<MiningTaxAssignmentRecord[]> {
  const groups = new Map<number, Map<string, string | undefined>>();
  for (const a of assignments) {
    if (a.groupId === undefined) continue;
    const payeeOf = groups.get(a.characterId) ?? new Map<string, string | undefined>();
    payeeOf.set(a.groupId, a.payeeId);
    groups.set(a.characterId, payeeOf);
  }
  const siblings: MiningTaxAssignmentRecord[] = [];
  for (const [characterId, payeeOf] of groups) {
    const own = await db.miningTaxAssignments.where('characterId').equals(characterId).toArray();
    siblings.push(
      ...own.filter(
        (a) =>
          a.status === 'outstanding' &&
          a.groupId !== undefined &&
          payeeOf.has(a.groupId) &&
          payeeOf.get(a.groupId) === a.payeeId
      )
    );
  }
  return siblings;
}

/**
 * Settle up for a Corp Tax Book: the member's side of a payment to the corporation. The ore of
 * each owed book row is recorded Paid under the member's Payee verified as the corporation
 * (created when they have none): their own owed Assignments under it are marked paid, and a new
 * Paid Assignment covers the rest their marks don't. The book counts that as paid on the
 * member's side; the corporation still confirms it against its wallet. A row that never lined up
 * with a ledger entry has no ore to record and stays owed.
 *
 * An entry is read once however many rows it carries (two refineries in one system give two),
 * and each row consumes the member's own corp Assignments and the entry's free ore in turn, so a
 * second row never counts the first one's new Assignment as its own. A row whose ore the ledger
 * already holds elsewhere fails the whole action with `held-elsewhere`, naming every such row.
 * An owed Assignment that is one day of a Combined Entry pays the entry's other owed days with it
 * (`owedCombinedSiblings`). With a payment, only what its amount covers is marked, oldest first:
 * the ticked rows, then the Combined Entry days the rest still reaches. What is left once whole
 * days are covered part-pays the next day: only that share of its ore is recorded, so the day
 * owes the rest. A payment is never marked against a day it cannot pay.
 */
export function recordCorpPayment(
  corp: { corporationId: number; name: string },
  rows: readonly BookRowView[],
  payment?: PaymentInput
): Promise<LedgerActionResult> {
  return commit(charactersOf(rows), async () => {
    const payeesOf = new Map<number, string[]>();
    const entries = new Map<string, EntryClaims>();
    const recorded = new Map<string, MiningTaxAssignmentRecord>();
    const heldElsewhere: { id: string; date: string }[] = [];
    // A payment marks the days its amount covers, oldest first, by the book's own rule (what the
    // dialog previewed, `wherePaymentGoes`); what is left over part-pays the next day, so that
    // day owes only the rest until the book verifies.
    const landing = payment
      ? wherePaymentGoes(
          // A row that never lined up with a ledger entry records nothing, so it takes no ISK.
          rows
            .filter((r) => r.solarSystemId !== 0)
            .map((r) => ({
              id: r.id,
              date: r.date,
              taxOwed: r.taxOwed ?? 0,
              ...(r.held ? { held: r.held } : {}),
            })),
          payment.amount
        )
      : null;
    const landed = new Map(landing?.days.map((d) => [d.id, d]));
    const part = rows.find((r) => landed.get(r.id)?.result === 'part');
    const partShare = part
      ? Math.min(1, (landed.get(part.id)?.partAmount ?? 0) / Math.max(1, part.taxOwed ?? 1))
      : 0;
    const paying = landing
      ? new Set(
          landing.days.filter((d) => d.result === 'paid' || d.result === 'part').map((d) => d.id)
        )
      : null;
    for (const row of rows) {
      if (row.solarSystemId === 0 || (paying && !paying.has(row.id))) continue;
      const isPart = row === part;
      let payeeIds = payeesOf.get(row.characterId);
      if (!payeeIds) {
        payeeIds = await corpEntityPayeeIds(row.characterId, corp, row.taxPct);
        payeesOf.set(row.characterId, payeeIds);
      }
      const key = entryKeyOf(row);
      let claims = entries.get(key);
      if (!claims) {
        const all = (
          await db.miningTaxAssignments.where('characterId').equals(row.characterId).toArray()
        ).filter((a) => a.date === row.date && a.solarSystemId === row.solarSystemId);
        const corpIds = payeeIds; // a const the filter's closure sees as defined
        const own = all.filter(
          (a) =>
            a.payeeId !== undefined &&
            corpIds.includes(a.payeeId) &&
            (a.status === 'paid' || a.status === 'outstanding')
        );
        claims = {
          owedOwn: own.filter((a) => a.status === 'outstanding'),
          ownPool: own.flatMap((a) => a.oreLines),
          claimed: new Map(),
        };
        for (const a of all) addClaims(claims.claimed, a.oreLines);
        entries.set(key, claims);
      }
      // A part-paid day leaves the member's own owed Assignments owed: they are the rest of it.
      if (!isPart) for (const a of claims.owedOwn) recorded.set(a.id, a);
      const unpaidLines = minusLines(row.oreLines, claims.ownPool);
      claims.ownPool = minusLines(claims.ownPool, row.oreLines);
      const oreLines = isPart
        ? unpaidLines
            .map((l) => ({ ...l, quantity: Math.floor(l.quantity * partShare) }))
            .filter((l) => l.quantity > 0)
        : unpaidLines;
      if (oreLines.length === 0) continue;
      if (!fitsEntry(claims, oreLines, row.personalOreLines)) {
        heldElsewhere.push({ id: row.id, date: row.date });
        continue;
      }
      addClaims(claims.claimed, oreLines);
      const value = computeAssignmentValue(oreLines, priceMap(row.unitPrices), row.taxPct);
      const created = await createAssignment({
        characterId: row.characterId,
        date: row.date,
        solarSystemId: row.solarSystemId,
        payeeId: payeeIds[0],
        oreLines,
        ...(row.personalOreLines ? { entryOreLines: row.personalOreLines } : {}),
        taxPct: row.taxPct,
        estimatedValue: value.estimatedValue,
        taxOwed: value.taxOwed,
        markPaid: false,
        ...(row.refineryLabel ? { label: row.refineryLabel } : {}),
      });
      recorded.set(created.id, created);
    }
    if (heldElsewhere.length > 0) throw new HeldElsewhereError(heldElsewhere);
    const siblings = await owedCombinedSiblings([...recorded.values()]);
    // A Combined Entry's other days ride along only as far as the ISK left after the rows reaches.
    const left = landing ? landing.credit : Infinity;
    const reached = payment
      ? new Set(
          allocateOldestFirst(
            siblings.filter((a) => !recorded.has(a.id)),
            left + amountSlack(payment.amount)
          ).coveredIds
        )
      : null;
    for (const sibling of siblings) {
      if (reached && !recorded.has(sibling.id) && !reached.has(sibling.id)) continue;
      recorded.set(sibling.id, sibling);
    }
    await markAssignmentsPaid([...recorded.values()], payment);
  });
}
