export interface MemoizedAsync<T> {
  (): Promise<T>;
  /** Drops the memo. Test-only in practice: lets a test swap the source between cases. */
  reset(): void;
}

/**
 * Memoizes an async loader for the session. A failure is never memoized, so a
 * later call that can reach the source still gets it. By default the failure
 * rejects; with `{ fallback }` it resolves to that value instead.
 */
export function memoizeAsync<T>(loader: () => Promise<T>): MemoizedAsync<T>;
export function memoizeAsync<T, F>(
  loader: () => Promise<T>,
  options: { fallback: F }
): MemoizedAsync<T | F>;
export function memoizeAsync<T, F>(
  loader: () => Promise<T>,
  options?: { fallback: F }
): MemoizedAsync<T | F> {
  let memo: Promise<T | F> | null = null;
  const get = (): Promise<T | F> => {
    if (memo) return memo;
    const pending: Promise<T | F> = loader().catch((error: unknown) => {
      // Allow retry after failure — unless a reset already replaced this load.
      if (memo === pending) memo = null;
      if (options) return options.fallback;
      throw error;
    });
    memo = pending;
    return pending;
  };
  get.reset = () => {
    memo = null;
  };
  return get;
}
