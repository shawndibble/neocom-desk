/**
 * A Running account's closed-through checkpoint (decision 20261120-235011): what a Miner's account
 * stood at through a date no sync can change any more, so a load reads the checkpoint and only
 * the days after it instead of the whole history.
 *
 * ESI's mining ledgers reach back about 30 days, so a day more than 31 days old cannot gain ore.
 * The checkpoint rolls forward a month at a time, to the end of the last month that ended at
 * least `CLOSE_AFTER_DAYS` days ago, and never moves back. A fix to a closed day is an
 * Adjustment dated today.
 *
 * Shared by the client and the Cloud Functions (decision 20261117-230113): dependency-free.
 * Stored at `corps/{id}/accountCheckpoints/{minerId}` for a Corp Tax Book (written by an
 * officer's tab through a callable: the server has no prices) and on the pilot's device for a
 * personal Payee.
 */

/** How old the end of a month must be before it closes: past ESI's ~30-day ledger window. */
export const CLOSE_AFTER_DAYS = 31;

/** A day still owed at the checkpoint, with what was left of it. */
export interface CheckpointOwedDay {
  date: string;
  remaining: number;
  /** Of `remaining`, what officers' charges make up: never forgiven by a later paid-through. */
  charge?: number;
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
  /** ISO instant it was recorded, and who recorded it (a Character id; absent on a device). */
  at: string;
  by?: number;
}

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` of a UTC instant in ms. */
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The newest date an account may be closed through on `today` (`YYYY-MM-DD`, UTC): the end of the
 * last month that ended at least `CLOSE_AFTER_DAYS` days before today.
 */
export function closedThroughFor(today: string): string {
  const cutoff = Date.parse(`${today}T00:00:00Z`) - CLOSE_AFTER_DAYS * DAY_MS;
  const c = new Date(cutoff);
  // The last day of the month before the cutoff's, unless the cutoff is itself a month's last day.
  const endOfCutoffMonth = Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 0);
  return isoDay(
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
