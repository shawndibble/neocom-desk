import { useEffect, useState } from 'react';

/**
 * The one debounce for typing that only filters in-memory lists (assets,
 * roster, mail headers, skill picker). Lookups that hit the network or write
 * the URL wait a little longer — see `LOOKUP_DEBOUNCE_MS`.
 */
export const SEARCH_DEBOUNCE_MS = 250;

/** Debounce for typing that triggers a network lookup or a URL write. */
export const LOOKUP_DEBOUNCE_MS = 300;

/**
 * Trails `value` by `delayMs`: the input stays instantly responsive while
 * the expensive work keyed on the returned value waits out the debounce.
 * Starts at `value`, so the first render is never stale.
 *
 * Returns `[debounced, flush]`. `flush(next)` jumps the debounced value
 * straight to `next` — for a Clear button, where lagging the cleared list
 * behind the emptied input would look broken.
 */
export function useDebouncedValue<T>(
  value: T,
  delayMs: number = SEARCH_DEBOUNCE_MS
): [T, (next: T) => void] {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return [debounced, setDebounced];
}
