import { useCallback, useLayoutEffect, useRef, useState } from 'react';

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
