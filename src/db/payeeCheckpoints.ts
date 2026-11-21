/**
 * Where the device keeps each personal Payee's closed-through checkpoint (decision
 * 20261120-235011): never synced, so any device can recompute it. The account is built from a
 * stored checkpoint and the days after it only, so a write dated on or before one drops it (the
 * server's rule for a book's): every Assignment, link and Payee write, the sync's pulls included,
 * calls `dropPayeeCheckpointsFrom`. Dexie-only, so the sync layer may call it.
 */
import { utcDayOf } from '../../functions/src/timeConstants';
import { db } from './index';

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
 * Drops every checkpoint a write dated `date` reaches: those closed through it or later. `null`
 * drops them all (a Payee write can regroup who a checkpoint belongs to). Run inside a transaction
 * that covers `db.settings`, or none.
 */
export async function dropPayeeCheckpointsFrom(date: string | null): Promise<void> {
  await db.settings.put({ key: PAYEE_HISTORY_GEN_KEY, value: (await readPayeeHistoryGen()) + 1 });
  const held = await readStoredCheckpoints();
  const kept = Object.entries(held).filter(
    ([, cp]) => date !== null && cp.checkpoint.through < date
  );
  if (kept.length === Object.keys(held).length) return;
  await db.settings.put({ key: PAYEE_CHECKPOINTS_KEY, value: Object.fromEntries(kept) });
}

/** The earliest of some dates (`YYYY-MM-DD`, or ISO instants), or undefined for none. */
export function earliestDay(dates: Iterable<string | undefined>): string | undefined {
  let out: string | undefined;
  for (const d of dates) {
    const day = d === undefined ? undefined : utcDayOf(d);
    if (day && (out === undefined || day < out)) out = day;
  }
  return out;
}
