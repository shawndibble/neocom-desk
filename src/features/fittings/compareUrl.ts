/**
 * Compare's URL state: up to three Share Link codes as repeated `?f=`
 * params. The house `useUrlParams` (`@/lib/useUrlState.ts`, ADR 0015) reads
 * one value per key, so a repeated key needs its own thin codec instead.
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export const MAX_COMPARE_SLOTS = 3;

/** Every non-empty `f` value, capped at `MAX_COMPARE_SLOTS`. */
export function parseCompareCodes(params: URLSearchParams): string[] {
  return params
    .getAll('f')
    .filter((code) => code !== '')
    .slice(0, MAX_COMPARE_SLOTS);
}

/** `params` with every `f` replaced by `codes` (capped, empties dropped); every other key is left untouched. */
export function writeCompareCodes(
  params: URLSearchParams,
  codes: readonly string[]
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('f');
  for (const code of codes.filter((c) => c !== '').slice(0, MAX_COMPARE_SLOTS))
    next.append('f', code);
  return next;
}

/** The compare slots, read from and written to `?f=&f=&f=`. Each write is a history entry, so Back steps through add/remove/replace the same way a Fitting edit does. */
export function useCompareCodes(): [readonly string[], (codes: readonly string[]) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  // `getAll('f')` is a stable dependency key — `searchParams` itself is a
  // fresh object every render, which would otherwise re-run every effect
  // that depends on the returned array on every unrelated render.
  const fKey = searchParams.getAll('f').join('\u0000');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `fKey` is `searchParams`' own relevant slice, kept as a stable string on purpose (see above)
  const codes = useMemo(() => parseCompareCodes(searchParams), [fKey]);
  const setCodes = useCallback(
    (next: readonly string[]) => {
      setSearchParams((prev) => writeCompareCodes(prev, next));
    },
    [setSearchParams]
  );
  return [codes, setCodes];
}
