import { db, type MiningTaxAssignmentRecord } from '@/db';

export function withoutPaidMark(next: MiningTaxAssignmentRecord): MiningTaxAssignmentRecord {
  const out: MiningTaxAssignmentRecord = { ...next };
  delete out.payment;
  delete out.paidAt;
  if (out.status === 'paid' || (out.status as string) === 'tracked') out.status = 'outstanding';
  return out;
}

export async function putAssignments(records: readonly MiningTaxAssignmentRecord[]): Promise<void> {
  if (records.length > 0) await db.miningTaxAssignments.bulkPut(records.map(withoutPaidMark));
}
