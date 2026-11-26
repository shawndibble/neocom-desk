export interface MemoizedAsync<T> {
  (): Promise<T>;
  reset(): void;
}

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
      if (memo === pending) memo = null;
      if (options) return options.fallback;
      throw error;
    });
    memo = pending;
    return pending;
  };
  return Object.assign(get, {
    reset: () => {
      memo = null;
    },
  });
}
