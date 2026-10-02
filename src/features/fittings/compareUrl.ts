/**
 * Compare's URL state: up to three Fitting Share Codes as repeated `?f=`
 * params. The house `useUrlParams` (`@/lib/useUrlState.ts`, ADR 0015) reads
 * one value per key, so a repeated key needs its own thin codec instead.
 */
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
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

/** A new code list, or a function of the latest one — the latest *written*, which can be ahead of the last rendered. */
export type CompareCodesUpdate =
  readonly string[] | ((prev: readonly string[]) => readonly string[]);

/**
 * The compare slots, read from and written to `?f=&f=&f=`. Each write is a history entry, so Back steps through add/remove/replace the same way a Fitting edit does.
 *
 * Pass an updater for any change relative to the current slots (add, remove). `BrowserRouter`
 * commits a location change inside a transition, so on a busy main thread (the dogma engine
 * calculating the slot just added) the page can go on rendering the old `?f=` long after the
 * write — and a second "Compare with…" pick built from those rendered codes would replace the
 * first pick instead of adding to it. `setSearchParams`' own updater form doesn't help: it too
 * starts from the rendered params. So the latest written list is kept here and updaters build on it.
 */
export function useCompareCodes(): [readonly string[], (update: CompareCodesUpdate) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  // `getAll('f')` is a stable dependency key — `searchParams` itself is a
  // fresh object every render, which would otherwise re-run every effect
  // that depends on the returned array on every unrelated render.
  const fKey = searchParams.getAll('f').join('\u0000');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `fKey` is `searchParams`' own relevant slice, kept as a stable string on purpose (see above)
  const codes = useMemo(() => parseCompareCodes(searchParams), [fKey]);
  const latest = useRef<readonly string[]>(codes);
  // Only when the URL's `f` set itself changes (a write landing, Back/Forward): a render that still
  // shows the old location must not roll back a write that hasn't rendered yet.
  useLayoutEffect(() => {
    latest.current = codes;
  }, [codes]);
  const setCodes = useCallback(
    (update: CompareCodesUpdate) => {
      const next = parseCompareCodes(
        writeCompareCodes(
          new URLSearchParams(),
          typeof update === 'function' ? update(latest.current) : update
        )
      );
      latest.current = next;
      setSearchParams((prev) => writeCompareCodes(prev, next));
    },
    [setSearchParams]
  );
  return [codes, setCodes];
}
