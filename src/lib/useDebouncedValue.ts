import { useEffect, useState } from 'react';

export const SEARCH_DEBOUNCE_MS = 250;

export const LOOKUP_DEBOUNCE_MS = 300;

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
