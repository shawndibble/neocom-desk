/**
 * Short-lived view state in the query string (ADR 0015): the React side of
 * `./urlState.ts`'s codecs.
 *
 * - **Replace, not push.** A filter keystroke or a sort click is not a place
 *   Back should return to; tab switches (`usePageTab`) are the pushes. A
 *   write that *is* a place to return to — a Fitting edit (issue #1533) —
 *   opts in with `{ push: true }`.
 * - **Debounced text.** A codec with `debounceMs` holds its value locally and
 *   writes once typing pauses; any other key changing in the same update
 *   flushes the pending text with it, in one navigation.
 * - **Grouped writes.** One `useUrlParams` call owns a set of keys and writes
 *   them together. Two separate hooks writing in the same tick would each
 *   start from the URL as last rendered and the second would drop the first,
 *   so keys that change together (a filter bar's text, types and standings)
 *   belong in one group.
 * - **Read-only defaults.** The URL wins over a default; absent means the
 *   default. Nothing read from the URL is written back to a stored setting
 *   (scope decision "persisted view preferences stay out of the URL").
 *   `useRememberedUrlParams` below stores a reader's own *edit* of a field
 *   with a stored default, and its opt-in `adoptLinked` is the one recorded
 *   exception.
 *
 * Pass a schema that is stable across renders — module scope, or a `useMemo`.
 */
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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

/** `push` adds a history entry instead of replacing the current one. */
export interface UrlWriteOptions {
  push?: boolean;
}

export type UrlParamValues<S extends UrlParamSchema> = {
  [K in keyof S]: S[K] extends UrlParamCodec<infer T> ? T : never;
};

type AnyCodec = UrlParamCodec<unknown>;

export function useUrlParams<S extends UrlParamSchema>(
  schema: S
): [UrlParamValues<S>, (patch: Partial<UrlParamValues<S>>, options?: UrlWriteOptions) => void] {
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
    (values: Record<string, unknown>, push = false) => {
      timer.current = null;
      // One transition for both: `BrowserRouter` applies a navigation inside
      // `startTransition`, so clearing `pending` urgently would commit a frame
      // with the old URL's values — the text box would flicker back, and a
      // write in that frame would start from the stale query string.
      startTransition(() => {
        setPending({});
        writeParams(latest.current.location, latest.current.navigate, codecs, values, push);
      });
    },
    [codecs]
  );

  const setValues = useCallback(
    (patch: Partial<UrlParamValues<S>>, options?: UrlWriteOptions) => {
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
        flush(next, options?.push);
        return;
      }
      setPending(next);
      timer.current = setTimeout(() => flush(latest.current.pending, options?.push), wait);
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
  values: Record<string, unknown>,
  push: boolean
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
    { replace: !push, state: location.state }
  );
}

/** One URL-backed value; `useUrlParams` with a single key. */
export function useUrlParam<T>(
  key: string,
  codec: UrlParamCodec<T>
): [T, (value: T, options?: UrlWriteOptions) => void] {
  const schema = useMemo(() => ({ [key]: codec }) as unknown as UrlParamSchema, [key, codec]);
  const [values, setValues] = useUrlParams(schema);
  const setValue = useCallback(
    (value: T, options?: UrlWriteOptions) =>
      setValues({ [key]: value } as Partial<UrlParamValues<UrlParamSchema>>, options),
    [key, setValues]
  );
  return [(values as Record<string, T>)[key], setValue];
}

/**
 * A `DataTable`'s sort bound to one query key: spread the result onto the
 * table (`<DataTable {...sortProps} />`). A sort naming a column the table
 * does not have reads as `defaultSort`. `defaultSort` should be
 * a module constant; `columnIds` is only compared, so a fresh list is fine.
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

/**
 * A filter object backed by a `useUrlParams` group, unwrapped through a
 * field-to-param-key map — plain data, so (unlike a hook taking `unwrap`/
 * `wrap` callbacks) it costs no fresh closure identity every render as long
 * as the caller passes a module-scope map.
 *
 * Resets to `emptyParams` whenever `scopeKey` changes *after* mount (a
 * division switch, an owner toggle — whatever the caller's filter should
 * not survive) — never on mount itself, so a filter delivered by the URL on
 * first load is not immediately wiped. Build `scopeKey` from the same
 * synchronous source the URL itself reads from, not from anything that
 * settles asynchronously (an access check, a fetched list): if `scopeKey`
 * can read one value on the first render and a different one a render later
 * for reasons unrelated to the field it names, that settling looks
 * indistinguishable from a real change and the filter is wiped for it.
 */
export function useUrlFilter<F extends object>(
  scopeKey: string,
  schema: UrlParamSchema,
  fieldToParam: Record<keyof F & string, string>,
  emptyParams: Record<string, unknown>
): [F, (next: F) => void] {
  const [params, setParams] = useUrlParams(schema);
  const filter = useMemo(() => {
    const result = {} as F;
    for (const field in fieldToParam) {
      const key = field as keyof F & string;
      result[key] = params[fieldToParam[key]] as F[typeof key];
    }
    return result;
  }, [params, fieldToParam]);
  const setFilter = useCallback(
    (next: F) => {
      const patch: Record<string, unknown> = {};
      for (const field in fieldToParam) {
        const key = field as keyof F & string;
        patch[fieldToParam[key]] = next[key];
      }
      setParams(patch);
    },
    [fieldToParam, setParams]
  );
  const lastScopeKey = useRef(scopeKey);
  useEffect(() => {
    if (lastScopeKey.current === scopeKey) return;
    lastScopeKey.current = scopeKey;
    setParams(emptyParams);
  }, [scopeKey, setParams, emptyParams]);
  return [filter, setFilter];
}

/**
 * The stored side of a `useRememberedUrlParams` group: a preference saved
 * long-term (a `useLocalSetting` store, say) that stands in for any field the
 * URL leaves out. Build it in a `useMemo` over the store's value.
 */
export interface RememberedDefaults<S extends UrlParamSchema> {
  /**
   * The stored default for each field it covers. A field it leaves out has no
   * stored default: it is URL-only, and the codec's own default applies.
   */
  values: Partial<UrlParamValues<S>>;
  /**
   * False until the store has read its value. Only `adoptLinked` waits on
   * it, and absent reads as false, so an adopting caller that forgets it
   * never adopts against a not-yet-read default.
   */
  hydrated?: boolean;
  /** Persists an edit — called with only the covered fields the edit touched. */
  remember(patch: Partial<UrlParamValues<S>>): void;
  /**
   * Whether a value the URL states is usable. One it rejects (an id no
   * catalogue has) reads as absent, so the stored default shows instead.
   */
  accepts?: (key: keyof S & string, value: unknown) => boolean;
  /**
   * Opt-in exception to scope decision `20260922-221531`: once hydrated,
   * copy each covered field the URL states into storage whenever the two
   * differ. Market Browser only — see decision `20260926-201312`. Everyone
   * else leaves it off, and nothing read from the URL is ever stored.
   */
  adoptLinked?: boolean;
}

/**
 * A `useUrlParams` group with a remembered default behind some of its fields
 * (scope decision `20260922-221531`, ADR 0015):
 *
 * - **Per-field presence.** A field the URL states wins; one it leaves out
 *   reads the stored default. Presence is the raw query string's, since a
 *   parsed value equal to the codec default cannot tell "not given" from
 *   "the sender chose the default".
 * - **Edits go only where they belong.** The setter takes a patch or the
 *   whole displayed object (a `FilterBar` commits the whole thing on every
 *   edit) and diffs it against what is shown. Only the fields that actually
 *   changed are written — to the URL, and to storage when they have a stored
 *   default. An untouched field is never carried from one source into the
 *   other: a stored default is not mirrored into the URL, and a link's value
 *   is not written into storage.
 *
 * The third return value says whether the URL states a field right now.
 */
export function useRememberedUrlParams<S extends UrlParamSchema>(
  schema: S,
  remembered: RememberedDefaults<S>
): [
  UrlParamValues<S>,
  (next: Partial<UrlParamValues<S>>, options?: UrlWriteOptions) => void,
  (key: keyof S & string) => boolean,
] {
  const [urlValues, setUrlValues] = useUrlParams(schema);
  const { search } = useLocation();
  const codecs = schema as unknown as Record<string, AnyCodec>;
  const { values: stored, accepts, hydrated = false, adoptLinked = false, remember } = remembered;
  const storedValues = stored as Record<string, unknown>;

  // What the URL itself states, parsed from the query string rather than read
  // off `urlValues` — that also carries a debounced edit not yet written.
  const linked = useMemo(() => {
    const raw = new URLSearchParams(search);
    const result = new Map<string, unknown>();
    for (const [key, codec] of Object.entries(codecs)) {
      if (!raw.has(key)) continue;
      const value = codec.parse(raw.get(key));
      if (accepts && !accepts(key as keyof S & string, value)) continue;
      result.set(key, value);
    }
    return result;
  }, [search, codecs, accepts]);

  const values = useMemo(() => {
    const result: Record<string, unknown> = { ...urlValues };
    for (const key of Object.keys(storedValues)) {
      if (!linked.has(key)) result[key] = storedValues[key];
    }
    return result;
  }, [urlValues, storedValues, linked]);

  const latest = useRef({ values, storedValues, remember });
  useLayoutEffect(() => {
    latest.current = { values, storedValues, remember };
  });

  const setValues = useCallback(
    (next: Partial<UrlParamValues<S>>, options?: UrlWriteOptions) => {
      const { values: shown, storedValues: covered, remember: persist } = latest.current;
      const changed: Record<string, unknown> = {};
      const toRemember: Record<string, unknown> = {};
      let rememberAny = false;
      for (const [key, value] of Object.entries(next as Record<string, unknown>)) {
        const codec = codecs[key];
        if (codec.serialize(value as never) === codec.serialize(shown[key] as never)) continue;
        changed[key] = value;
        if (key in covered) {
          toRemember[key] = value;
          rememberAny = true;
        }
      }
      // Called even when nothing changed, as `useUrlParams`' own setter would
      // be: a commit flushes any debounced text still waiting.
      setUrlValues(changed as Partial<UrlParamValues<S>>, options);
      if (rememberAny) persist(toRemember as Partial<UrlParamValues<S>>);
    },
    [codecs, setUrlValues]
  );

  useEffect(() => {
    if (!adoptLinked || !hydrated) return;
    const patch: Record<string, unknown> = {};
    let adoptAny = false;
    for (const [key, value] of linked) {
      if (!(key in storedValues)) continue;
      const codec = codecs[key];
      if (codec.serialize(value as never) === codec.serialize(storedValues[key] as never)) continue;
      patch[key] = value;
      adoptAny = true;
    }
    if (adoptAny) remember(patch as Partial<UrlParamValues<S>>);
  }, [adoptLinked, hydrated, linked, storedValues, codecs, remember]);

  const isLinked = useCallback((key: keyof S & string) => linked.has(key), [linked]);
  return [values as UrlParamValues<S>, setValues, isLinked];
}
