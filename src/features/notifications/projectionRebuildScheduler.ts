export const PROJECTION_REBUILD_DELAY_MS = 1000;

function logWriteFailure(write: Promise<unknown>): Promise<unknown> {
  return write.catch((err: unknown) => console.error('Notification preference write failed', err));
}

export function createCoalescedRebuild(
  rebuild: () => Promise<void>,
  delayMs: number
): ((write: Promise<unknown>) => void) & { cancel: () => void } {
  let pending: Promise<unknown>[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
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

  const schedule = (write: Promise<unknown>) => {
    pending.push(logWriteFailure(write));
    if (draining) return;
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), delayMs);
  };

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!draining) pending = [];
  };

  return Object.assign(schedule, { cancel });
}

export const scheduleProjectionRebuild = createCoalescedRebuild(async () => {
  const [{ rebuildProjection }, { liveDependencies }] = await Promise.all([
    import('./projectionRebuild'),
    import('./foregroundPoller'),
  ]);
  await rebuildProjection(liveDependencies());
}, PROJECTION_REBUILD_DELAY_MS);
