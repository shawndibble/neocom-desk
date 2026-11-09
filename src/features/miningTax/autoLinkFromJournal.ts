/**
 * Silently links recorded Settle-up payments to their wallet-journal entries
 * from the journal's side, so a tax payment's link doesn't wait for the pilot
 * to open Moon Mining Tax (`useLinkSuggestions` does the same match there).
 *
 * Gated on the recorded-but-unlinked payments, which are few and live in
 * Dexie: with none, the journal is never scanned. With some, the journal is
 * walked once and only compared against those groups, so its size doesn't
 * multiply the work.
 */
import { db } from '@/db';
import type { WalletJournalEntry } from '@/esi/endpoints';
import { linkRecordedPayment } from './ledgerActions';
import { fromJournal } from './madePayments';
import {
  autoMatchRecordedPayments,
  unlinkedPayments,
  unlinkedRecordedPayments,
} from './paymentLinks';

export interface CharacterJournal {
  characterId: number;
  entries: readonly WalletJournalEntry[];
}

export async function autoLinkRecordedPaymentsFromJournals(
  journals: readonly CharacterJournal[]
): Promise<void> {
  if (journals.every((j) => j.entries.length === 0)) return;
  const assignments = await db.miningTaxAssignments.toArray();
  const groups = unlinkedRecordedPayments(assignments);
  if (groups.length === 0) return;
  const payments = unlinkedPayments(
    journals.flatMap((j) => fromJournal(j.entries, j.characterId)),
    assignments
  );
  await Promise.all(
    autoMatchRecordedPayments(payments, groups).map(({ group, payment }) =>
      linkRecordedPayment(group.assignments, { journalRefId: payment.refId })
    )
  );
}
