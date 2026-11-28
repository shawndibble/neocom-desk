import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

export const MAX_COMPARE_SLOTS = 3;

export function parseCompareCodes(params: URLSearchParams): string[] {
  return params
    .getAll('f')
    .filter((code) => code !== '')
    .slice(0, MAX_COMPARE_SLOTS);
}

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

export type CompareCodesUpdate =
  readonly string[] | ((prev: readonly string[]) => readonly string[]);

export function useCompareCodes(): [readonly string[], (update: CompareCodesUpdate) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const { state } = useLocation();
  const latestState = useRef<unknown>(state);
  const fKey = searchParams.getAll('f').join('\u0000');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `fKey` is `searchParams`' own relevant slice, kept as a stable string on purpose (see above)
  const codes = useMemo(() => parseCompareCodes(searchParams), [fKey]);
  const latest = useRef<readonly string[]>(codes);
  useLayoutEffect(() => {
    latest.current = codes;
  }, [codes]);
  useLayoutEffect(() => {
    latestState.current = state;
  }, [state]);
  const setCodes = useCallback(
    (update: CompareCodesUpdate) => {
      const next = parseCompareCodes(
        writeCompareCodes(
          new URLSearchParams(),
          typeof update === 'function' ? update(latest.current) : update
        )
      );
      latest.current = next;
      setSearchParams((prev) => writeCompareCodes(prev, next), { state: latestState.current });
    },
    [setSearchParams]
  );
  return [codes, setCodes];
}
