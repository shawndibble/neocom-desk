export const YIELD_BUDGET_MS = 8;

interface SchedulerLike {
  yield?: () => Promise<void>;
}

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
