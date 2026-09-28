/**
 * Hands the main thread back to the browser for one turn, so input and
 * paint get in between two runs of synchronous engine work. Once the dogma
 * engine is loaded, `await`ing its (already-settled) promises only queues a
 * microtask — a loop of calculations would still run as one long task. This
 * waits for a macrotask: `scheduler.yield()` where the browser has it (which
 * resumes ahead of other queued tasks), else a `MessageChannel` message
 * (not clamped to 4 ms like a nested `setTimeout`), else `setTimeout(0)`.
 */
export function yieldToEventLoop(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (typeof scheduler?.yield === 'function') return scheduler.yield();
  if (typeof MessageChannel !== 'undefined') {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        resolve();
      };
      channel.port2.postMessage(null);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}
