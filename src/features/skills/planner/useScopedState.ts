import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * State that describes one "scope" — a tuple of values compared member by
 * member with `===` — and reads as `null` once any member changes: an Optimize
 * result, a reorder preview or a drop refusal is about the plan as it stood
 * when it was produced, and says nothing true about a plan edited since.
 *
 * Derived rather than cleared: nothing resets the held value when the scope
 * moves on; it simply stops matching. The setter is stable, and tags a value
 * with the scope of the last committed render — the plan the user was looking
 * at when they acted.
 */
export function useScopedState<T>(
  scope: readonly unknown[]
): [T | null, (value: T | null) => void] {
  const [held, setHeld] = useState<{ scope: readonly unknown[]; value: T } | null>(null);
  const scopeRef = useRef(scope);
  useLayoutEffect(() => {
    scopeRef.current = scope;
  });
  const set = useCallback(
    (value: T | null) => setHeld(value === null ? null : { scope: scopeRef.current, value }),
    []
  );
  const live = held !== null && sameScope(held.scope, scope) ? held.value : null;
  return [live, set];
}

function sameScope(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((member, i) => member === b[i]);
}
