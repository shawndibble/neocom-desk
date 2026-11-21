/**
 * Where the device keeps each personal Payee's closed-through checkpoint (decision
 * 20261120-235011): never synced, so any device can recompute it. The Running account is built
 * from a stored checkpoint and the days after it only, so a write that reaches a closed day drops
 * them (`dropPayeeCheckpointsReachedBy`, the books' rule): every Assignment, link and Payee write
 * here, and every such row a sync pull changes (`subscribeRecordsChanged`). A write past the app
 * (an import, a removed Character) is caught by the checkpoint's own closed summary.
 */
import { editReachesCheckpoint } from '../../../functions/src/corpTaxBookCheckpoint';
import { utcDayOf } from '../../../functions/src/timeConstants';
import { db, type MiningTaxAssignmentRecord, type MiningTaxPaymentLinkRecord } from '@/db';
import { utcDay } from '@/engine/localDay';
import { subscribeRecordsChanged } from '@/sync/recordsChanged';

export const PAYEE_CHECKPOINTS_KEY = 'miningTaxPayeeCheckpoints';
/**
 * Counts the writes that could reach a closed account. A checkpoint is only stored while it is
 * what the device last read (`savePayeeCheckpoints` compares it), so one computed from history a
 * write has since changed is never kept.
 */
export const PAYEE_HISTORY_GEN_KEY = 'miningTaxPayeeHistoryGen';

export async function readPayeeHistoryGen(): Promise<number> {
  const value = (await db.settings.get(PAYEE_HISTORY_GEN_KEY))?.value;
  return typeof value === 'number' ? value : 0;
}

/** The stored value: each merged Payee's primary id to its checkpoint. */
export type StoredCheckpoints = Record<string, { checkpoint: { through: string } }>;

export async function readStoredCheckpoints(): Promise<StoredCheckpoints> {
  const value = (await db.settings.get(PAYEE_CHECKPOINTS_KEY))?.value;
  return value && typeof value === 'object' ? (value as StoredCheckpoints) : {};
}

/**
 * Drops the device's checkpoints when a write dated `onOrBefore` reaches a closed account: the
 * books' own rule (`editReachesCheckpoint`: dated on or before the newest day a checkpoint can
 * close today), so a checkpoint is a strict cache here as there. `null` reaches every day (a Payee
 * write can regroup whose money pays which days). Run inside a transaction that covers
 * `db.settings`, or none.
 */
export async function dropPayeeCheckpointsReachedBy(
  onOrBefore: string | null,
  today: string = utcDay()
): Promise<void> {
  if (!editReachesCheckpoint(onOrBefore, today)) return;
  const [genRow, heldRow] = await db.settings.bulkGet([
    PAYEE_HISTORY_GEN_KEY,
    PAYEE_CHECKPOINTS_KEY,
  ]);
  const gen = typeof genRow?.value === 'number' ? genRow.value : 0;
  const held = heldRow?.value && typeof heldRow.value === 'object' ? heldRow.value : {};
  await db.settings.bulkPut([
    { key: PAYEE_HISTORY_GEN_KEY, value: gen + 1 },
    ...(Object.keys(held).length > 0 ? [{ key: PAYEE_CHECKPOINTS_KEY, value: {} }] : []),
  ]);
}

/**
 * The earliest day among some dates (`YYYY-MM-DD`, or ISO instants), the missing ones skipped;
 * undefined when none is known. (The server's private `earliestDay` instead answers null when any
 * is unknown.)
 */
export function earliestKnownDay(dates: Iterable<string | undefined>): string | undefined {
  let out: string | undefined;
  for (const d of dates) {
    const day = d === undefined ? undefined : utcDayOf(d);
    if (day && (out === undefined || day < out)) out = day;
  }
  return out;
}

// What another device changed, pulled by the sync, reaches the closed accounts too.
subscribeRecordsChanged<MiningTaxAssignmentRecord>('miningTaxAssignments', (c) =>
  dropPayeeCheckpointsReachedBy(
    earliestKnownDay([...c.upserted, ...c.before, ...c.deleted].map((a) => a.date)) ?? null
  )
);
subscribeRecordsChanged<MiningTaxPaymentLinkRecord>('miningTaxPaymentLinks', (c) =>
  dropPayeeCheckpointsReachedBy(
    earliestKnownDay([...c.upserted, ...c.before, ...c.deleted].map((l) => l.paidOn)) ?? null
  )
);
subscribeRecordsChanged('payees', () => dropPayeeCheckpointsReachedBy(null));
