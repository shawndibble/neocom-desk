/**
 * Time-sliced yielding for long synchronous loops (issue #4098). Chunking by
 * item count then `setTimeout(0)` pays the ~4ms nested-timeout clamp per
 * chunk; instead keep working until a time budget is spent, then yield via
 * `scheduler.yield` (keeps priority) or a MessageChannel (no clamp).
 */
export const YIELD_BUDGET_MS = 8;

interface SchedulerLike {
  yield?: () => Promise<void>;
}

/** One macrotask turn. `scheduler.yield` when present, else MessageChannel. */
export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: SchedulerLike }).scheduler;
  if (typeof scheduler?.yield === 'function') return scheduler.yield();
  if (typeof MessageChannel === 'function') {
    return new Promise((resolve) => {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = () => {
        port1.close();
        resolve();
      };
      port2.postMessage(null);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Returns `maybeYield()`: resolves immediately until `budgetMs` has elapsed
 * since the last yield, then yields once and restarts the clock.
 */
export function createYielder(
  budgetMs = YIELD_BUDGET_MS,
  now: () => number = () => performance.now(),
  yieldFn: () => Promise<void> = yieldToMain
): () => Promise<void> {
  let last = now();
  return async () => {
    if (now() - last < budgetMs) return;
    await yieldFn();
    last = now();
  };
}
