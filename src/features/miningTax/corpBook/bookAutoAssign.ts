import { db, type MiningTaxAssignmentRecord, type PayeeRecord } from '@/db';
import {
  planBookAutoAssign,
  type AutoAssignBook,
  type BookAutoAssignSlice,
} from '@/engine/miningTax/bookAutoAssign';
import { payeesOfBookCorporation } from '@/engine/miningTax/payeeCorporation';
import {
  assignmentRecordChange,
  type AssignmentTerms,
  type OwnedRecordChange,
} from '@/engine/miningTax/recordChanges';
import type { MiningLedgerEntry } from '@/engine/miningTax/types';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { loadDefaultOptOuts } from '../defaultOptOuts';
import { assign } from '../ledgerActions';
import { readCompressedOre } from '../oreForm';
import { createPayeeOnce, loadPayees } from '../payees';
import type { PayeeRunningAccounts } from '../payeeRunningAccounts';
import { linksReady, loadPayeeRunningAccounts } from '../paymentLinkStore';
import { hubForPayee, loadUnitPricesOnDate } from '../pricing';
import { recordChangesReady, saveRecordChanges } from '../recordChangeStore';
import { takeOverFromDefaults } from '../surveyConnections';

export interface BookAutoAssignTarget extends AutoAssignBook {
  hubId: string;
}

export interface BookAutoAssignResult {
  ready: boolean;
  created: MiningTaxAssignmentRecord[];
}

const termsOf = (a: MiningTaxAssignmentRecord): AssignmentTerms => ({
  payeeId: a.payeeId ?? null,
  taxPct: a.taxPct,
  taxOwed: a.taxOwed,
  oreLines: a.oreLines,
});

async function corpPayeeFor(
  slice: BookAutoAssignSlice,
  book: BookAutoAssignTarget,
  payees: readonly PayeeRecord[]
): Promise<PayeeRecord | undefined> {
  if (slice.payeeId !== undefined) return payees.find((p) => p.id === slice.payeeId);
  const corporation = { corporationId: book.corporationId, name: book.corpName };
  const { payee } = await createPayeeOnce(
    slice.characterId,
    {
      name: book.corpName,
      defaultTaxPct: slice.taxPct,
      hubId: book.hubId,
      entityId: book.corporationId,
      entityKind: 'corporation',
    },
    (stored) => {
      const [found] = payeesOfBookCorporation(stored, corporation);
      return stored.find((p) => p.id === found?.id);
    }
  );
  return payee;
}

async function assignSlice(
  slice: BookAutoAssignSlice,
  book: BookAutoAssignTarget,
  payees: readonly PayeeRecord[],
  stored: readonly MiningTaxAssignmentRecord[],
  paid: PayeeRunningAccounts
): Promise<{ record: MiningTaxAssignmentRecord; owned?: OwnedRecordChange } | undefined> {
  const payee = await corpPayeeFor(slice, book, payees);
  if (!payee) return undefined;
  const { prices } = await loadUnitPricesOnDate(
    slice.oreLines.map((line) => line.typeId),
    hubForPayee(payee.hubId ?? book.hubId),
    slice.date,
    await readCompressedOre()
  );
  const value = computeAssignmentValue(slice.oreLines, prices, slice.taxPct);
  const taken = slice.takeovers.flatMap((t) => stored.find((a) => a.id === t.assignmentId) ?? []);
  if (!(await takeOverFromDefaults(slice.takeovers, paid))) return undefined;
  const result = await assign({
    characterId: slice.characterId,
    date: slice.date,
    solarSystemId: slice.solarSystemId,
    payeeId: payee.id,
    oreLines: slice.oreLines,
    entryOreLines: slice.entryOreLines,
    taxPct: slice.taxPct,
    estimatedValue: value.estimatedValue,
    taxOwed: value.taxOwed,
    takesGrowth: true,
    ...(slice.label !== undefined ? { label: slice.label } : {}),
    isPaid: (a) => paid.isPaid(a),
  });
  if (!result.ok) return undefined;
  const change = assignmentRecordChange({
    id: `autoAssign:${result.value.id}`,
    reason: 'autoAssign',
    at: new Date().toISOString(),
    date: slice.date,
    corporationId: slice.corporationId,
    minerId: slice.minerId,
    assignments: [
      ...taken.map((a) => ({ assignmentId: a.id, before: termsOf(a), after: null })),
      { assignmentId: result.value.id, before: null, after: termsOf(result.value) },
    ],
  });
  return {
    record: result.value,
    ...(change ? { owned: { characterId: slice.characterId, change } } : {}),
  };
}

export async function applyBookAutoAssign(
  books: readonly BookAutoAssignTarget[],
  entries: readonly MiningLedgerEntry[],
  now: string
): Promise<BookAutoAssignResult> {
  const characterIds = [...new Set(entries.map((e) => e.characterId))];
  if (books.length === 0 || characterIds.length === 0) return { ready: true, created: [] };
  if (!(await linksReady(characterIds)) || !(await recordChangesReady(characterIds)))
    return { ready: false, created: [] };
  const [paid, optedOut] = await Promise.all([loadPayeeRunningAccounts(), loadDefaultOptOuts()]);
  const created: MiningTaxAssignmentRecord[] = [];
  const changes: OwnedRecordChange[] = [];
  for (const characterId of characterIds) {
    const [stored, payees] = await Promise.all([
      db.miningTaxAssignments.where('characterId').equals(characterId).toArray(),
      loadPayees(characterId),
    ]);
    const slices = planBookAutoAssign({
      entries: entries.filter((e) => e.characterId === characterId),
      assignments: stored.map((a) => paid.view(a)),
      books,
      payees,
      optedOut,
      now,
    });
    for (const slice of slices) {
      const book = books.find((b) => b.corporationId === slice.corporationId);
      if (!book) continue;
      try {
        const done = await assignSlice(slice, book, payees, stored, paid);
        if (!done) continue;
        created.push(done.record);
        if (done.owned) changes.push(done.owned);
      } catch {}
    }
  }
  await saveRecordChanges(changes);
  return { ready: true, created };
}
