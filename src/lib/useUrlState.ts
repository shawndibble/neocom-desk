import {
  startTransition,
  type ContextType,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  UNSAFE_NavigationContext as NavigationContext,
  useLocation,
  useNavigate,
  type Location,
  type NavigateFunction,
} from 'react-router-dom';
import { resolveSort, sortParam, type UrlParamCodec, type UrlSort } from './urlState';

export type UrlParamSchema = Record<
  string,
  {
    parse(raw: string | null): unknown;
    serialize(value: never): string | null;
    debounceMs?: number;
  }
>;

export interface UrlWriteOptions {
  push?: boolean;
  state?: unknown;
  clearHash?: boolean;
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
  const history = useContext(NavigationContext);
  const codecs = schema as unknown as Record<string, AnyCodec>;

  const urlValues = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const values: Record<string, unknown> = {};
    for (const [key, codec] of Object.entries(codecs)) values[key] = codec.parse(params.get(key));
    return values;
  }, [location.search, codecs]);

  const [pending, setPending] = useState<Record<string, unknown>>({});

  const latest = useRef({ location, navigate, history, urlValues, pending });
  useLayoutEffect(() => {
    latest.current = { location, navigate, history, urlValues, pending };
  });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    []
  );

  const flush = useCallback(
    (values: Record<string, unknown>, options: UrlWriteOptions = {}) => {
      timer.current = null;
      startTransition(() => {
        setPending({});
        const { location: shown, navigate: go, history: router } = latest.current;
        const at = currentLocation(router, shown);
        if (at !== null) writeParams(at, go, codecs, values, options);
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
      latest.current = { ...latest.current, pending: next };
      setPending(next);
      if (immediate || wait === 0) {
        flush(next, options);
        return;
      }
      timer.current = setTimeout(() => flush(latest.current.pending, options), wait);
    },
    [codecs, flush]
  );

  const values = useMemo(() => ({ ...urlValues, ...pending }), [urlValues, pending]);
  return [values as UrlParamValues<S>, setValues];
}

function currentLocation(
  router: ContextType<typeof NavigationContext>,
  shown: Location
): Location | null {
  const live = (router.navigator as { location?: Location }).location;
  if (live === undefined) return shown;
  const trim = (path: string) => path.replace(/\/+$/, '');
  const basename = trim(router.basename);
  const pathname = live.pathname.startsWith(basename)
    ? live.pathname.slice(basename.length) || '/'
    : live.pathname;
  return trim(pathname) === trim(shown.pathname) ? { ...live, pathname: shown.pathname } : null;
}

function writeParams(
  location: Location,
  navigate: NavigateFunction,
  codecs: Record<string, AnyCodec>,
  values: Record<string, unknown>,
  { push = false, clearHash = false, state }: UrlWriteOptions
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
    {
      pathname: location.pathname,
      search: search === '' ? '' : `?${search}`,
      hash: clearHash ? '' : location.hash,
    },
    { replace: !push, state: state ?? location.state }
  );
}

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

export function useUrlSort(
  key: string,
  defaultSort: UrlSort,
  columnIds: readonly string[]
): { sort: UrlSort; onSortChange: (sort: UrlSort) => void } {
  const codec = useMemo(() => sortParam(defaultSort), [defaultSort]);
  const [sort, setSort] = useUrlParam(key, codec);
  return { sort: resolveSort(sort, defaultSort, columnIds), onSortChange: setSort };
}

export function filterFromParamValues<F extends object>(
  values: Record<string, unknown>,
  fieldToParam: Record<keyof F & string, string>
): F {
  const result = {} as F;
  for (const field in fieldToParam) {
    const key = field as keyof F & string;
    result[key] = values[fieldToParam[key]] as F[typeof key];
  }
  return result;
}

export function paramsPatchFromFilter<F extends object>(
  next: F,
  fieldToParam: Record<keyof F & string, string>
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field in fieldToParam) {
    const key = field as keyof F & string;
    patch[fieldToParam[key]] = next[key];
  }
  return patch;
}

export function useUrlFilter<F extends object>(
  scopeKey: string,
  schema: UrlParamSchema,
  fieldToParam: Record<keyof F & string, string>,
  emptyParams: Record<string, unknown>
): [F, (next: F) => void, F] {
  const [params, setParams] = useUrlParams(schema);
  const filter = useMemo(
    () => filterFromParamValues<F>(params, fieldToParam),
    [params, fieldToParam]
  );
  const setFilter = useCallback(
    (next: F) => setParams(paramsPatchFromFilter(next, fieldToParam)),
    [fieldToParam, setParams]
  );
  const lastScopeKey = useRef(scopeKey);
  useEffect(() => {
    if (lastScopeKey.current === scopeKey) return;
    lastScopeKey.current = scopeKey;
    setParams(emptyParams);
  }, [scopeKey, setParams, emptyParams]);
  const rowsFilter = useDeferredValue(filter);
  return [filter, setFilter, rowsFilter];
}

export interface RememberedDefaults<S extends UrlParamSchema> {
  values: Partial<UrlParamValues<S>>;
  hydrated?: boolean;
  remember(patch: Partial<UrlParamValues<S>>): void;
  accepts?: (key: keyof S & string, value: unknown) => boolean;
  adoptLinked?: boolean;
}

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
