/**
 * Coalesced Projection rebuilds after preference writes (issue #1259).
 *
 * Each upload replaces a Character's whole stored Projection (issue #358), so
 * without a rebuild a toggle or threshold change leaves a stale or missing
 * Scheduled Push until the next poll. Uploads cost, so a burst of writes
 * shares one rebuild: it runs after a quiet period *and* once every write in
 * it settles — an earlier read could project the old value, or re-hydrate the
 * synced threshold over the new one. A failed synced half still rebuilds: the
 * local value is already set.
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

/** Only the browser channel feeds the upload (`mayProject`); a feed write just logs failures. */
export function rebuildProjectionAfterChannelWrite(
  channel: NotificationChannel,
  write: Promise<unknown>
): void {
  if (channel === 'browser') scheduleProjectionRebuild(write);
  else void logWriteFailure(write);
}
