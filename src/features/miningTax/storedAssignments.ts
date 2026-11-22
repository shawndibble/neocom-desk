/**
 * The one way an Assignment is written (decision 20261120-235011, "a view never reaches a
 * write"). Rows on screen carry a Paid read off the Payee's account (`PayeeRunningAccounts.view`);
 * an Assignment never stores one, so whatever a caller hands in is written without a paid mark.
 */
import { db, type MiningTaxAssignmentRecord } from '@/db';

/** `next` with no paid mark: Paid is the Payee's account's, never the Assignment's. */
export function withoutPaidMark(next: MiningTaxAssignmentRecord): MiningTaxAssignmentRecord {
  const out: MiningTaxAssignmentRecord = { ...next };
  delete out.payment;
  delete out.paidAt;
  if (out.status === 'paid') out.status = 'outstanding';
  return out;
}

/** Writes Assignments, each without a paid mark (`withoutPaidMark`). */
export async function putAssignments(records: readonly MiningTaxAssignmentRecord[]): Promise<void> {
  if (records.length > 0) await db.miningTaxAssignments.bulkPut(records.map(withoutPaidMark));
}
