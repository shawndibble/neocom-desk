/**
 * Short-lived view state in the query string (ADR 0015): the React side of
 * `./urlState.ts`'s codecs.
 *
 * - **Replace, not push.** A filter keystroke or a sort click is not a place
 *   Back should return to; tab switches (`usePageTab`) are the pushes.
 * - **Debounced text.** A codec with `debounceMs` holds its value locally and
 *   writes once typing pauses; any other key changing in the same update
 *   flushes the pending text with it, in one navigation.
 * - **Grouped writes.** One `useUrlParams` call owns a set of keys and writes
 *   them together. Two separate hooks writing in the same tick would each
 *   start from the URL as last rendered and the second would drop the first,
 *   so keys that change together (a filter bar's text, types and standings)
 *   belong in one group.
 * - **Read-only defaults.** The URL wins over a default; absent means the
 *   default. Nothing here writes back to a stored setting (scope decision
 *   "persisted view preferences stay out of the URL").
 *
 * Pass a schema that is stable across renders — module scope, or a `useMemo`.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, type Location, type NavigateFunction } from 'react-router-dom';
import { resolveSort, sortParam, type UrlParamCodec, type UrlSort } from './urlState';

/** Any codec, whatever its value type — `serialize`'s parameter is the only contravariant spot. */
export type UrlParamSchema = Record<
  string,
  {
    parse(raw: string | null): unknown;
    serialize(value: never): string | null;
    debounceMs?: number;
  }
>;

export type UrlParamValues<S extends UrlParamSchema> = {
  [K in keyof S]: S[K] extends UrlParamCodec<infer T> ? T : never;
};

type AnyCodec = UrlParamCodec<unknown>;

export function useUrlParams<S extends UrlParamSchema>(
  schema: S
): [UrlParamValues<S>, (patch: Partial<UrlParamValues<S>>) => void] {
  const location = useLocation();
  const navigate = useNavigate();
  const codecs = schema as unknown as Record<string, AnyCodec>;

  const urlValues = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const values: Record<string, unknown> = {};
    for (const [key, codec] of Object.entries(codecs)) values[key] = codec.parse(params.get(key));
    return values;
  }, [location.search, codecs]);

  const [pending, setPending] = useState<Record<string, unknown>>({});

  // The timer below fires after later renders — possibly after a tab switch
  // changed the path — so it must write against the location as it is *then*,
  // not as it was when the keystroke scheduled it.
  const latest = useRef({ location, navigate, urlValues, pending });
  useLayoutEffect(() => {
    latest.current = { location, navigate, urlValues, pending };
  });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Leaving the page drops a pending write rather than landing it on
  // whichever page the reader went to.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    []
  );

  const flush = useCallback(
    (values: Record<string, unknown>) => {
      timer.current = null;
      setPending({});
      writeParams(latest.current.location, latest.current.navigate, codecs, values);
    },
    [codecs]
  );

  const setValues = useCallback(
    (patch: Partial<UrlParamValues<S>>) => {
      const { urlValues: current, pending: queued } = latest.current;
      const next = { ...queued, ...(patch as Record<string, unknown>) };
      let wait = 0;
      let immediate = false;
      for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
        const codec = codecs[key];
        const before = key in queued ? queued[key] : current[key];
        if (codec.serialize(value) === codec.serialize(before)) continue;
        if (codec.debounceMs) wait = Math.max(wait, codec.debounceMs);
        else immediate = true;
      }
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      // Written straight through too, so a second call before the next render
      // sees this one's value as its "before".
      latest.current = { ...latest.current, pending: next };
      if (immediate || wait === 0) {
        flush(next);
        return;
      }
      setPending(next);
      timer.current = setTimeout(() => flush(latest.current.pending), wait);
    },
    [codecs, flush]
  );

  const values = useMemo(() => ({ ...urlValues, ...pending }), [urlValues, pending]);
  return [values as UrlParamValues<S>, setValues];
}

function writeParams(
  location: Location,
  navigate: NavigateFunction,
  codecs: Record<string, AnyCodec>,
  values: Record<string, unknown>
): void {
  const params = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(values)) {
    const serialized = codecs[key].serialize(value);
    if (serialized === null) params.delete(key);
    else params.set(key, serialized);
  }
  const search = params.toString();
  if (`?${search}` === location.search || (search === '' && location.search === '')) return;
  navigate(
    { pathname: location.pathname, search: search === '' ? '' : `?${search}`, hash: location.hash },
    { replace: true, state: location.state }
  );
}

/** One URL-backed value; `useUrlParams` with a single key. */
export function useUrlParam<T>(key: string, codec: UrlParamCodec<T>): [T, (value: T) => void] {
  const schema = useMemo(() => ({ [key]: codec }) as unknown as UrlParamSchema, [key, codec]);
  const [values, setValues] = useUrlParams(schema);
  const setValue = useCallback(
    (value: T) => setValues({ [key]: value } as Partial<UrlParamValues<UrlParamSchema>>),
    [key, setValues]
  );
  return [(values as Record<string, T>)[key], setValue];
}

/**
 * A `DataTable`'s sort bound to one query key: spread the result onto the
 * table (`<DataTable {...sortProps} />`). A sort naming a column the table
 * does not have reads as `defaultSort`. `defaultSort` and `columnIds` should
 * be stable — a module constant and a memoised list.
 */
export function useUrlSort(
  key: string,
  defaultSort: UrlSort,
  columnIds: readonly string[]
): { sort: UrlSort; onSortChange: (sort: UrlSort) => void } {
  const codec = useMemo(() => sortParam(defaultSort), [defaultSort]);
  const [sort, setSort] = useUrlParam(key, codec);
  return { sort: resolveSort(sort, defaultSort, columnIds), onSortChange: setSort };
}
