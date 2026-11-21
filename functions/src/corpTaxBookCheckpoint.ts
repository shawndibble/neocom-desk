/**
 * A Running account's snapshot (decision 20261120-235011, "a lock date"): what a Miner's account
 * stood at through the day before the lock date, so a load reads the snapshot and only the days
 * after it instead of the whole history.
 *
 * History before the lock date is read-only (`isLocked`): the server refuses any edit dated before
 * it, so a snapshot never goes stale. An officer's tab records one per Miner per lock date, through
 * `snapshotThroughFor(today)`; only a change to the Miner's characters deletes it.
 *
 * Shared by the client and the Cloud Functions (decision 20261117-230113): dependency-free.
 * Stored at `corps/{id}/accountCheckpoints/{minerId}` for a Corp Tax Book (written by an
 * officer's tab through a callable: the server has no prices) and on the pilot's device for a
 * personal Payee.
 */
import { DAY_MS, utcDay } from './timeConstants.js';

/**
 * A day still owed at the checkpoint, with what was left of it. `remaining` is the day's whole
 * `tax` less what was `credited` into it and what the day tolerance `writtenOff`, so a rebuild
 * applies the tolerance to the whole day and reports its full figures.
 */
export interface CheckpointOwedDay {
  date: string;
  remaining: number;
  /** The day's whole tax. Required by the server; absent from a checkpoint recorded before it. */
  tax?: number;
  /** What was paid or credited into the day on or before `through`. */
  credited?: number;
  /** What the day tolerance wrote off. */
  writtenOff?: number;
  /** Of `remaining`, what officers' charges make up: never forgiven by a later paid-through. */
  charge?: number;
  /**
   * An open dispute holds the day: it stays in `owed` but out of `balance`, and the paid-through
   * day may pass it (decision 20261120-235011).
   */
  held?: boolean;
}

export interface RunningAccountCheckpoint {
  minerId: string;
  /** The last closed day, `YYYY-MM-DD`: every day on or before it is summed up here. */
  through: string;
  /** Days on or before `through` still owed, oldest first (usually none). */
  owed: CheckpointOwedDay[];
  /** Money ahead of every billed day at the checkpoint. */
  credit: number;
  /** Everything billed through `through` less everything paid, forgiven or written off. */
  balance: number;
  /** The newest day with nothing owed on or before it, at the checkpoint. */
  paidThrough: string | null;
  /**
   * The Miner's characters when it was summed. A checkpoint whose characters are not the Miner's
   * now is read as absent (`checkpointFits`): the account's history is no longer the one summed.
   */
  characterIds?: number[];
  /** ISO instant it was recorded, and who recorded it (a Character id; absent on a device). */
  at: string;
  by?: number;
}

/** Whether a stored checkpoint still stands for a Miner with these characters now. */
export function checkpointFits(
  checkpoint: Pick<RunningAccountCheckpoint, 'characterIds'>,
  characterIds: readonly number[]
): boolean {
  const held = checkpoint.characterIds;
  if (!held || held.length !== characterIds.length) return false;
  const now = new Set(characterIds);
  return held.every((c) => now.has(c)) && now.size === held.length;
}

/**
 * The lock date on `today` (`YYYY-MM-DD`, UTC): the 1st of the month two months back. Nothing
 * dated before it can be added, changed or removed, and a snapshot covers every day before it
 * (decision 20261120-235011, "a lock date"). On Dec 1 and on Dec 15 alike it is Oct 1.
 */
export function lockDateFor(today: string): string {
  const [y, m] = today.split('-').map(Number);
  return utcDay(Date.UTC(y, m - 3, 1));
}

/** The last day a snapshot on `today` covers: the day before the lock date. */
export function snapshotThroughFor(today: string): string {
  return utcDay(Date.parse(`${lockDateFor(today)}T00:00:00Z`) - DAY_MS);
}

/**
 * Whether an edit dated `date` (a day or an instant) falls before the lock date on `today`, so the
 * server refuses it. An undated one is never locked.
 */
export function isLocked(date: string | undefined, today: string): boolean {
  return !!date && date.slice(0, 10) < lockDateFor(today);
}

/**
 * Whether a stored checkpoint is a snapshot: through a day already locked on the day it was
 * recorded, so nothing it summed can have changed since. One recorded through days still open
 * then (the strict cache it replaced) is not, and is recorded again.
 */
export function isSnapshot(checkpoint: Pick<RunningAccountCheckpoint, 'through' | 'at'>): boolean {
  return checkpoint.through <= snapshotThroughFor(checkpoint.at.slice(0, 10));
}

/** Why a checkpoint does not add up. */
export type CheckpointProblem =
  | 'owed-order'
  | 'owed-after-through'
  | 'owed-remaining'
  | 'owed-figures'
  | 'owed-charge'
  | 'credit'
  | 'balance'
  | 'paid-through';

/** Within an ISK: a fraction of per-day rounding is no mismatch. */
const close = (a: number, b: number) => Math.abs(a - b) < 1;

/**
 * Every way a checkpoint does not add up in itself, none when it does:
 * - owed days oldest first, once each, none after `through`;
 * - each day still owes something, `remaining` = `tax` − `credited` − `writtenOff`, and an
 *   officer's charge is no more than it owes;
 * - no negative credit, and `balance` = what the days not held by a dispute owe, less the credit;
 * - the paid-through day is no later than `through` and before the oldest day a sync still owes:
 *   one neither held by a dispute nor owing only an officer's charge (a charge is never forgiven
 *   by paying through it).
 */
export function checkpointProblems(
  c: Pick<RunningAccountCheckpoint, 'through' | 'owed' | 'credit' | 'balance' | 'paidThrough'>
): CheckpointProblem[] {
  const out: CheckpointProblem[] = [];
  const add = (p: CheckpointProblem, when: boolean) => {
    if (when && !out.includes(p)) out.push(p);
  };
  for (let i = 1; i < c.owed.length; i++) add('owed-order', c.owed[i].date <= c.owed[i - 1].date);
  add(
    'owed-after-through',
    c.owed.some((d) => d.date > c.through)
  );
  add(
    'owed-remaining',
    c.owed.some((d) => !(d.remaining > 0))
  );
  add(
    'owed-figures',
    c.owed.some(
      (d) =>
        d.tax === undefined ||
        d.credited === undefined ||
        !(d.credited >= 0) ||
        !((d.writtenOff ?? 0) >= 0) ||
        !close(d.remaining, d.tax - d.credited - (d.writtenOff ?? 0))
    )
  );
  add(
    'owed-charge',
    c.owed.some((d) => d.charge !== undefined && !(d.charge >= 0 && d.charge <= d.remaining))
  );
  add('credit', !(c.credit >= 0));
  const owed = c.owed.filter((d) => !d.held).reduce((sum, d) => sum + d.remaining, 0);
  add('balance', !close(c.balance, owed - c.credit));
  const syncOwed = c.owed.find((d) => !d.held && d.remaining - (d.charge ?? 0) >= 1);
  add(
    'paid-through',
    c.paidThrough !== null &&
      (c.paidThrough > c.through || (syncOwed !== undefined && c.paidThrough >= syncOwed.date))
  );
  return out;
}

// --- The strict cache's dates, still imported by the client until it follows the lock date. ---

/** How old the end of a month must be before it closes: past ESI's ~30-day ledger window. */
export const CLOSE_AFTER_DAYS = 31;

/**
 * The newest date an account may be closed through on `today` (`YYYY-MM-DD`, UTC): the end of the
 * last month that ended at least `CLOSE_AFTER_DAYS` days before today.
 */
export function closedThroughFor(today: string): string {
  const cutoff = Date.parse(`${today}T00:00:00Z`) - CLOSE_AFTER_DAYS * DAY_MS;
  const c = new Date(cutoff);
  // The last day of the month before the cutoff's, unless the cutoff is itself a month's last day.
  const endOfCutoffMonth = Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 0);
  return utcDay(
    endOfCutoffMonth === cutoff ? cutoff : Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), 0)
  );
}

/** Whether `next` may replace `stored`: it only ever moves forward, and never past what may close. */
export function canAdvanceCheckpoint(
  stored: Pick<RunningAccountCheckpoint, 'through'> | undefined,
  next: Pick<RunningAccountCheckpoint, 'through'>,
  today: string
): boolean {
  return next.through <= closedThroughFor(today) && (!stored || next.through > stored.through);
}

/**
 * Whether an edit dated `onOrBefore` (a day or an instant; null when it can reach any day, as a
 * write-off forgiving the oldest days does) may change a day a checkpoint closed on `today`. No
 * checkpoint closes a day after `closedThroughFor(today)`, so a later edit can touch none; an
 * earlier one makes the checkpoint stale (it is a strict cache: deleting it is always safe).
 */
export function editReachesCheckpoint(onOrBefore: string | null, today: string): boolean {
  return onOrBefore === null || onOrBefore.slice(0, 10) <= closedThroughFor(today);
}
