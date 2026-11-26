import {
  db,
  type MiningTaxAssignmentRecord,
  type MiningTaxAssignmentStatus,
  type MiningTaxOreLine,
  type PayeeRecord,
} from '@/db';
import type { PayeePaymentLink } from '@/engine/miningTax/payeeRunningAccount';
import { scheduleSync } from '@/sync';
import { removeTombstones, tombstoneKey } from '@/sync/localBookkeeping';
import { MINING_TAX_ASSIGNMENTS } from '@/sync/syncedCollections';
import {
  AlreadyAssignedError,
  createAssignment,
  deleteAssignments,
  dismissEntries,
  joinAssignments,
  moveAssignmentsToPayee,
  planNeedsReviewResolution,
  loadReleasePrices,
  releaseOreFromAssignment,
  type ReleasePrices,
  splitAssignment,
  uncombineAssignments,
  updateCombinedAssignments,
  type AssignInput,
  type DismissInput,
  type JoinMemberInput,
  type SplitInput,
  type SplitPrices,
  type UpdateCombinedInput,
} from './assignments';
import { recordDefaultOptOuts } from './defaultOptOuts';
import type { GroupMember } from './groupRows';
import { groupPayees } from './payeeGroups';
import { removePayeeRecord } from './payees';
import {
  linksReady,
  loadPayeeRunningAccounts,
  removePaymentLinks,
  savePaymentLink,
} from './paymentLinkStore';
import type { SessionContinuation } from './sessionContinuation';
import { putAssignments } from './storedAssignments';

export type {
  AssignInput,
  CombinedMemberValues,
  DismissInput,
  JoinMemberInput,
  SplitCollector,
  SplitInput,
  SplitPrices,
  UpdateCombinedInput,
} from './assignments';

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

async function paidReader(): Promise<(a: MiningTaxAssignmentRecord) => boolean> {
  const tracked = (await db.characters.toCollection().primaryKeys()) as number[];
  if (!(await linksReady(tracked))) return () => true;
  const accounts = await loadPayeeRunningAccounts();
  return (a) => accounts.isPaid(a);
}

export async function assign(
  input: Omit<AssignInput, 'isPaid'> & Partial<Pick<AssignInput, 'isPaid'>>
): Promise<LedgerActionResult<MiningTaxAssignmentRecord>> {
  let isPaid: AssignInput['isPaid'];
  try {
    isPaid = input.isPaid ?? (await paidReader());
  } catch (cause) {
    return failure(cause);
  }
  return commit([input.characterId], () => createAssignment({ ...input, isPaid }));
}

export async function combine(
  members: readonly JoinMemberInput[],
  payeeId: string,
  taxPct: number,
  pricesOn: (date: string) => ReadonlyMap<number, number>
): Promise<LedgerActionResult<MiningTaxAssignmentRecord[]>> {
  let isPaid: (a: MiningTaxAssignmentRecord) => boolean;
  try {
    isPaid = await paidReader();
  } catch (cause) {
    return failure(cause);
  }
  return commit(charactersOf(members), () =>
    joinAssignments(members, payeeId, taxPct, pricesOn, isPaid)
  );
}

export interface ContinueReceipt {
  characterId: number;
  createdId: string;
  previousId: string;
  previousWasCombined: boolean;
}

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

export function undoContinue(receipt: ContinueReceipt): Promise<LedgerActionResult> {
  return commit([receipt.characterId], async () => {
    const created = await db.miningTaxAssignments.get(receipt.createdId);
    if (created) await deleteAssignments([created]);
    if (receipt.previousWasCombined) return;
    const previous = await db.miningTaxAssignments.get(receipt.previousId);
    if (previous) await uncombineAssignments([previous]);
  });
}

export function dismiss(
  inputs: readonly DismissInput[]
): Promise<LedgerActionResult<MiningTaxAssignmentRecord[]>> {
  return commit(charactersOf(inputs), () => dismissEntries(inputs));
}

export async function dismissOwed(
  assignments: readonly MiningTaxAssignmentRecord[]
): Promise<LedgerActionResult> {
  const result = await commit(charactersOf(assignments), async () => {
    await deleteAssignments(assignments);
    await dismissEntries(
      assignments.map((a) => ({
        characterId: a.characterId,
        date: a.date,
        solarSystemId: a.solarSystemId,
        oreLines: a.oreLines,
        estimatedValue: a.estimatedValue,
      }))
    );
  });
  if (result.ok) await recordDefaultOptOuts(assignments).catch(() => undefined);
  return result;
}

export function editEntry(
  assignments: readonly MiningTaxAssignmentRecord[],
  input: UpdateCombinedInput
): Promise<LedgerActionResult<MiningTaxAssignmentRecord[]>> {
  return commit(charactersOf(assignments), () => updateCombinedAssignments(assignments, input));
}

export function uncombine(
  assignments: readonly MiningTaxAssignmentRecord[]
): Promise<LedgerActionResult> {
  return commit(charactersOf(assignments), () => uncombineAssignments(assignments));
}

export async function unassign(
  assignments: readonly MiningTaxAssignmentRecord[]
): Promise<LedgerActionResult> {
  const result = await commit(charactersOf(assignments), () => deleteAssignments(assignments));
  if (result.ok) await recordDefaultOptOuts(assignments).catch(() => undefined);
  return result;
}

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
    await putAssignments(resolved);
  });
}

export async function releaseOre(
  releases: readonly { assignment: MiningTaxAssignmentRecord; after: MiningTaxOreLine[] }[],
  takeoverFromDefault = false
): Promise<LedgerActionResult> {
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

export function restoreAssignments(
  records: readonly MiningTaxAssignmentRecord[]
): Promise<LedgerActionResult> {
  return commit(charactersOf(records), async () => {
    const idsByCharacter = new Map<number, string[]>();
    for (const r of records) {
      const ids = idsByCharacter.get(r.characterId);
      if (ids) ids.push(r.id);
      else idsByCharacter.set(r.characterId, [r.id]);
    }
    for (const [characterId, ids] of idsByCharacter)
      await removeTombstones(tombstoneKey(MINING_TAX_ASSIGNMENTS, characterId), ids);
    const now = Date.now();
    await putAssignments(records.map((r) => ({ ...r, updatedAt: now })));
  });
}

export function split(
  original: MiningTaxAssignmentRecord,
  input: SplitInput,
  prices: SplitPrices
): Promise<
  LedgerActionResult<{ kept: MiningTaxAssignmentRecord; created: MiningTaxAssignmentRecord }>
> {
  return commit([original.characterId], () => splitAssignment(original, input, prices));
}

export function assignmentsMovedWithPayee(
  assignments: readonly MiningTaxAssignmentRecord[],
  payeeId: string,
  statusOf: (a: MiningTaxAssignmentRecord) => MiningTaxAssignmentStatus
): MiningTaxAssignmentRecord[] {
  const own = assignments.filter((a) => a.payeeId === payeeId);
  const owed = (a: MiningTaxAssignmentRecord) => statusOf(a) === 'outstanding';
  const owedGroups = new Set(
    own.filter((a) => owed(a) && a.groupId !== undefined).map((a) => a.groupId)
  );
  return own.filter((a) => owed(a) || (a.groupId !== undefined && owedGroups.has(a.groupId)));
}

export async function deletePayee(
  payee: PayeeRecord,
  moveToPayeeId?: string
): Promise<LedgerActionResult> {
  let touched: { assignments: number[]; links: number[] };
  try {
    touched = await db.transaction(
      'rw',
      [db.miningTaxAssignments, db.payees, db.settings, db.miningTaxPaymentLinks],
      async () => {
        const accounts = await loadPayeeRunningAccounts();
        let moved: MiningTaxAssignmentRecord[] = [];
        if (moveToPayeeId !== undefined) {
          const characterIds = await db.miningTaxAssignments.orderBy('characterId').uniqueKeys();
          const own = await db.miningTaxAssignments
            .where('characterId')
            .anyOf(characterIds)
            .filter((a) => a.payeeId === payee.id)
            .toArray();
          moved = assignmentsMovedWithPayee(own, payee.id, (a) => accounts.statusOf(a));
          await moveAssignmentsToPayee(moved, moveToPayeeId);
        }
        const remaining = (await db.payees.toArray()).filter((p) => p.id !== payee.id);
        const group = groupPayees([...remaining, payee]).find((g) =>
          g.members.some((m) => m.id === payee.id)
        );
        const rest = group?.members.filter((m) => m.id !== payee.id) ?? [];
        const primaryOf = (id: string) =>
          groupPayees(remaining).find((g) => g.members.some((m) => m.id === id))?.primary.id ?? id;
        const to =
          rest.length > 0
            ? primaryOf(rest[0]!.id)
            : moveToPayeeId !== undefined
              ? primaryOf(moveToPayeeId)
              : undefined;
        const links =
          to === undefined
            ? []
            : await db.miningTaxPaymentLinks.filter((l) => l.payeeId === payee.id).toArray();
        const now = Date.now();
        await db.miningTaxPaymentLinks.bulkPut(
          links.map((l) => ({ ...l, payeeId: to!, updatedAt: now }))
        );
        await removePayeeRecord(payee);
        return {
          assignments: [payee.characterId, ...charactersOf(moved)],
          links: charactersOf(links),
        };
      }
    );
  } catch (cause) {
    return failure(cause);
  }
  for (const characterId of new Set(touched.assignments))
    scheduleSync(characterId, { collections: ['miningTaxAssignments', 'payees'] });
  for (const characterId of new Set(touched.links))
    scheduleSync(characterId, { collections: ['miningTaxPaymentLinks'] });
  return { ok: true, value: undefined };
}

export async function linkPayment(
  link: PayeePaymentLink,
  characterId: number,
  replaces?: string
): Promise<LedgerActionResult> {
  try {
    await savePaymentLink(link, characterId, replaces);
    return { ok: true, value: undefined };
  } catch (cause) {
    return failure(cause);
  }
}

export async function unlinkPayments(keys: readonly string[]): Promise<LedgerActionResult> {
  try {
    await removePaymentLinks(keys);
    return { ok: true, value: undefined };
  } catch (cause) {
    return failure(cause);
  }
}
