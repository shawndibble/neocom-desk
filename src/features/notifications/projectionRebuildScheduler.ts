/**
 * Coalesced Projection rebuilds after Settings writes (issue #1259).
 *
 * `registerDeviceForWebPush` replaces the backend's whole stored Projection
 * for a Character on every upload (issue #358), so a toggle or threshold
 * change otherwise leaves a stale Scheduled Push live — or a wanted one
 * missing — until the next ~5-minute poll. A rebuild makes no ESI data
 * fetches but does upload, so rapid clicks share one: each write restarts a
 * quiet period, and the rebuild runs once it ends *and* every write made in
 * it has settled. A rebuild reading preferences before then could project
 * the old value, or re-hydrate the synced threshold over the new one. It
 * still runs if a write's synced half failed: the local value is set by then.
 */
import type { NotificationChannel } from './eventSelection';
import { liveDependencies } from './foregroundPoller';
import { rebuildProjection } from './projectionRebuild';

/** Long enough to span a burst of checkbox clicks, short next to the poll. */
export const PROJECTION_REBUILD_DELAY_MS = 1000;

/** Caught at once: a rejection left unobserved until later is an unhandled rejection. */
function logWriteFailure(write: Promise<unknown>): Promise<unknown> {
  return write.catch((err: unknown) => console.error('Notification preference write failed', err));
}

export function createCoalescedRebuild(
  rebuild: () => Promise<void>,
  delayMs: number
): (write: Promise<unknown>) => void {
  let pending: Promise<unknown>[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  // While a flush waits on slow writes, new writes join it instead of
  // starting a second rebuild.
  let draining = false;

  const flush = async () => {
    timer = undefined;
    draining = true;
    while (pending.length > 0) {
      const writes = pending;
      pending = [];
      await Promise.all(writes);
    }
    draining = false;
    await rebuild().catch((err: unknown) =>
      console.error('Scheduled Push projection rebuild failed', err)
    );
  };

  return (write) => {
    pending.push(logWriteFailure(write));
    if (draining) return;
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), delayMs);
  };
}

/** The app-wide instance; `rebuildProjection` itself serializes overlapping runs. */
export const scheduleProjectionRebuild = createCoalescedRebuild(
  () => rebuildProjection(liveDependencies()),
  PROJECTION_REBUILD_DELAY_MS
);

/**
 * A Scheduled Push is the closed-app analog of the *browser* channel only
 * (`projectionRebuild.ts`), so a feed-channel write can't change the upload.
 */
export function rebuildProjectionAfterChannelWrite(
  channel: NotificationChannel,
  write: Promise<unknown>
): void {
  if (channel === 'browser') scheduleProjectionRebuild(write);
  else void logWriteFailure(write);
}
