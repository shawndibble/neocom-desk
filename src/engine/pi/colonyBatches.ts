/**
 * Colonies grouped into the trips they actually represent.
 *
 * PI is done in sittings: a pilot opens the client and resets every planet in
 * one go, so a batch of colonies comes to share an expiry give or take the
 * minutes it took to walk the list. The unit of work is therefore the **reset
 * run**, never the colony — and a dashboard that prints a row per planet
 * prints "3h 12m" four times for one trip.
 *
 * This is what makes the Overview's Planetary card survive a large operation:
 * eighteen colonies is still three or four rows, because eighteen colonies is
 * still three or four trips.
 *
 * Pure: no fetch/DOM/Dexie, and `nowMs` is always a parameter — the same
 * convention `colonyStatus.ts` follows.
 */
import type { DeadlineSeverity } from '@/engine/severity';
import { colonyAttention, EXPIRING_SOON_WINDOW_MS } from './colonyStatus';
import type { ColonyStatus } from './types';

/**
 * How far apart two expiries can be and still be one trip.
 *
 * Ninety minutes, which is a generous evening's session rather than a tight
 * bound, and deliberately so: the failure that matters is splitting one run in
 * two, because that is the case where the board goes back to repeating itself.
 * Merging two genuinely separate runs an hour apart costs a reader almost
 * nothing — the row still names the soonest deadline, which is when to go.
 *
 * Not `EXPIRING_SOON_WINDOW_MS`, and not the pilot's own expiring-soon
 * preference: those answer "is this urgent", a question about now. This one
 * answers "were these installed in one sitting", a question about each other.
 */
export const BATCH_WINDOW_MS = 90 * 60_000;

export type ColonyBatchKind =
  /** Extractors that have already stopped. Nothing is being produced. */
  | 'expired'
  /** A live program, with a deadline. */
  | 'running'
  /** No extractor program at all — a colony built but never set going, or a bare planet. */
  | 'idle';

export interface ColonyBatch<T> {
  kind: ColonyBatchKind;
  /**
   * The run's deadline: its soonest member. Null for a batch with no clock.
   *
   * On an `expired` batch this is in the *past* — when the first colony
   * stopped — so it is a fact to display, never a deadline to schedule
   * against. A caller looking for "the next thing due" wants a `running`
   * batch and must say so.
   */
  expiryMs: number | null;
  severity: DeadlineSeverity;
  colonies: T[];
}

/**
 * `colonyAttention`'s four states, mapped onto the app's severity ladder.
 *
 * `decayed` lands on `watch` rather than `warning`: a decayed colony is still
 * producing, just not efficiently, so it belongs below a colony with a clock
 * running out and well below one that has stopped.
 */
function severityForRunning(
  status: ColonyStatus,
  nowMs: number,
  expiringSoonWindowMs: number
): DeadlineSeverity {
  switch (colonyAttention(status, nowMs, expiringSoonWindowMs)) {
    case 'idle':
      return 'critical';
    case 'expiring-soon':
      return 'warning';
    case 'decayed':
      return 'watch';
    case 'healthy':
      return 'clear';
  }
}

/**
 * `colonies` grouped into runs, worst first: what has stopped, then live
 * programs by deadline, then whatever has no extractor at all.
 *
 * `statusOf` rather than a fixed shape, matching `sortColoniesByAttention` —
 * the caller's colony type carries names, ids and whatever else the view
 * needs, and none of it is this function's business.
 */
export function groupColoniesIntoBatches<T>(
  colonies: readonly T[],
  statusOf: (colony: T) => ColonyStatus,
  nowMs: number,
  expiringSoonWindowMs: number = EXPIRING_SOON_WINDOW_MS
): ColonyBatch<T>[] {
  const expired: { colony: T; stoppedMs: number }[] = [];
  const noExtractor: T[] = [];
  const running: { colony: T; expiryMs: number }[] = [];

  for (const colony of colonies) {
    const status = statusOf(colony);
    if (status.idle) {
      expired.push({ colony, stoppedMs: status.soonestExpiryMs ?? nowMs });
    } else if (status.soonestExpiryMs === null) {
      noExtractor.push(colony);
    } else {
      running.push({ colony, expiryMs: status.soonestExpiryMs });
    }
  }

  const batches: ColonyBatch<T>[] = [];

  /*
   * Every stopped colony in one batch, whatever each one's stop time. When it
   * stopped changes nothing about what to do — they are one errand, and
   * splitting them by expiry would put back exactly the volume this grouping
   * exists to remove.
   */
  if (expired.length > 0) {
    batches.push({
      kind: 'expired',
      expiryMs: Math.min(...expired.map((entry) => entry.stoppedMs)),
      severity: 'critical',
      colonies: expired.map((entry) => entry.colony),
    });
  }

  /*
   * Chained, not bucketed: each colony joins the open run while it is within
   * the window of the one *before* it, so a gradual spread across an evening
   * stays one trip even when its ends are further apart than the window. Fixed
   * buckets would cut such a spread at an arbitrary boundary.
   */
  running.sort((a, b) => a.expiryMs - b.expiryMs);
  let open: typeof running = [];
  const closeRun = () => {
    if (open.length === 0) return;
    const expiryMs = open[0].expiryMs;
    batches.push({
      kind: 'running',
      expiryMs,
      // The run's own urgency is its soonest member's: that is when you have
      // to go, and the later planets are coming with you.
      severity: severityForRunning(statusOf(open[0].colony), nowMs, expiringSoonWindowMs),
      colonies: open.map((entry) => entry.colony),
    });
    open = [];
  };
  for (const entry of running) {
    if (open.length > 0 && entry.expiryMs - open[open.length - 1].expiryMs > BATCH_WINDOW_MS) {
      closeRun();
    }
    open.push(entry);
  }
  closeRun();

  if (noExtractor.length > 0) {
    batches.push({ kind: 'idle', expiryMs: null, severity: 'clear', colonies: noExtractor });
  }

  return batches;
}
