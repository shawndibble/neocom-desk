/**
 * The one way an Assignment is written (decision 20261120-235011, "a view never reaches a
 * write"). Rows on screen carry a Paid read off the Payee's account (`PayeeRunningAccounts.view`), and
 * old paid marks (`status: 'paid'`, `payment`, `paidAt`) are an older client's, never this one's:
 * whatever a caller hands in, the mark the stored record holds is written back exactly as it was,
 * and a record that never held one is never given one.
 */
import { db, type MiningTaxAssignmentRecord } from '@/db';
import { dropPayeeCheckpointsFrom, earliestDay } from '@/db/payeeCheckpoints';

const MARKS = ['payment', 'paidAt'] as const;

/** `next` with `stored`'s paid mark: a derived Paid dropped, a stored one kept as it was. */
export function withStoredMark(
  next: MiningTaxAssignmentRecord,
  stored: MiningTaxAssignmentRecord | undefined
): MiningTaxAssignmentRecord {
  const out: MiningTaxAssignmentRecord = { ...next };
  for (const field of MARKS) delete out[field];
  if (stored?.payment !== undefined) out.payment = stored.payment;
  if (stored?.paidAt !== undefined) out.paidAt = stored.paidAt;
  // Paid / Outstanding is the account's: the stored word stays whatever the caller derived.
  const marked = stored?.status === 'paid' || stored?.status === 'outstanding';
  if (marked && (out.status === 'paid' || out.status === 'outstanding')) out.status = stored.status;
  else if (out.status === 'paid') out.status = 'outstanding';
  return out;
}

/**
 * Writes Assignments, each with its stored record's paid mark (`withStoredMark`), and drops the
 * Payees' checkpoints the write reaches back to (`dropPayeeCheckpointsFrom`). Only awaits Dexie,
 * so it may run inside a caller's transaction over the Assignments and `db.settings`.
 */
export async function putAssignments(records: readonly MiningTaxAssignmentRecord[]): Promise<void> {
  if (records.length === 0) return;
  await db.transaction('rw', db.miningTaxAssignments, db.settings, async () => {
    const stored = await db.miningTaxAssignments.bulkGet(records.map((r) => r.id));
    await dropPayeeCheckpointsFrom(
      earliestDay([...records.map((r) => r.date), ...stored.map((r) => r?.date)])!
    );
    await db.miningTaxAssignments.bulkPut(records.map((r, i) => withStoredMark(r, stored[i])));
  });
}
