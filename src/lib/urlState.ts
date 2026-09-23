/**
 * Codecs for short-lived view state kept in the URL's query string (ADR 0015):
 * a page's search text, filter chips and table sort, so a reload — or a link
 * pasted to another pilot — reopens the same view.
 *
 * Pure: parsing and serialising only. `useUrlParams` (`./useUrlState.ts`) is
 * the React side that reads and writes `location.search` through these.
 *
 * Every codec follows the same two rules, which is what lets a hand-edited or
 * outdated link degrade quietly instead of breaking the page:
 *
 * - **The default is never written.** `serialize` returns `null` for it, and
 *   the hook deletes the key, so an untouched view has a clean URL.
 * - **Garbage parses to the default.** A value the codec cannot read is
 *   treated as "not given", never coerced into something half-valid.
 *
 * Create codecs once — at module scope, or in a `useMemo` when the default is
 * only known at runtime — not inline in render: the hook re-parses when a
 * codec's identity changes, and a parsed `Set` or array with a fresh identity
 * every render churns every dependency array it reaches.
 */
import { parsePositiveInt } from '@/engine/market/urlState';

export interface UrlParamCodec<T> {
  /** `raw` is `URLSearchParams.get`'s result: `null` when the key is absent. */
  parse(raw: string | null): T;
  /** `null` means "this is the default" — the key is removed from the URL. */
  serialize(value: T): string | null;
  /**
   * Milliseconds to wait for typing to pause before writing. Absent for
   * anything a click sets: a chip or a sort is one change, not a stream.
   */
  readonly debounceMs?: number;
}

/** How long a text box waits after the last keystroke before rewriting the URL. */
export const TEXT_DEBOUNCE_MS = 300;

export function textParam(options: { defaultValue?: string } = {}): UrlParamCodec<string> {
  const defaultValue = options.defaultValue ?? '';
  return {
    parse: (raw) => raw ?? defaultValue,
    serialize: (value) => (value === defaultValue ? null : value),
    debounceMs: TEXT_DEBOUNCE_MS,
  };
}

export function intParam(
  defaultValue: number,
  bounds: { min?: number; max?: number } = {}
): UrlParamCodec<number> {
  const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = bounds;
  return {
    parse: (raw) => {
      if (raw === null || !/^-?\d+$/.test(raw)) return defaultValue;
      const n = Number(raw);
      return Number.isSafeInteger(n) && n >= min && n <= max ? n : defaultValue;
    },
    serialize: (value) => (value === defaultValue ? null : String(value)),
  };
}

/** `'1'` / `'0'`; only the side that differs from the default ever appears. */
export function boolParam(defaultValue = false): UrlParamCodec<boolean> {
  return {
    parse: (raw) => (raw === '1' ? true : raw === '0' ? false : defaultValue),
    serialize: (value) => (value === defaultValue ? null : value ? '1' : '0'),
  };
}

export function enumParam<V extends string>(
  values: readonly V[],
  defaultValue: V
): UrlParamCodec<V> {
  return {
    parse: (raw) => ((values as readonly string[]).includes(raw ?? '') ? (raw as V) : defaultValue),
    serialize: (value) => (value === defaultValue ? null : value),
  };
}

/**
 * A comma-separated list of positive ids (character, type, location…),
 * sorted and de-duplicated so the same selection always writes the same URL.
 * One unreadable entry discards the whole list: a partial selection the
 * reader never made is worse than the default.
 */
export function idListParam(): UrlParamCodec<readonly number[]> {
  return {
    parse: (raw) => {
      if (raw === null || raw === '') return [];
      const ids = raw.split(',').map(parsePositiveInt);
      if (ids.some((id) => id === null)) return [];
      return [...new Set(ids as number[])].sort((a, b) => a - b);
    },
    serialize: (value) =>
      value.length === 0 ? null : [...new Set(value)].sort((a, b) => a - b).join(','),
  };
}

/** One positive id (a region, a blueprint type…), or `null` for "none chosen". */
export function optionalIdParam(): UrlParamCodec<number | null> {
  return {
    parse: parsePositiveInt,
    serialize: (value) => (value === null ? null : String(value)),
  };
}

/**
 * A calendar day as `YYYY-MM-DD`, or `null` for "open-ended". A day that does
 * not exist (`2026-02-30`) is garbage, not a rollover into March.
 */
export function isoDateParam(): UrlParamCodec<string | null> {
  return {
    parse: (raw) => {
      if (raw === null || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
      const date = new Date(`${raw}T00:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(raw) ? raw : null;
    },
    serialize: (value) => value,
  };
}

/**
 * A subset of a closed set of members — filter chips that start all-on.
 * The empty set is a real, writable value (`key=`), distinct from the absent
 * key that means "the default". Written in `values`' order, so toggling chips
 * back and forth lands on the same URL.
 */
export function enumSetParam<V extends string>(
  values: readonly V[],
  defaultValue: readonly V[] = values
): UrlParamCodec<ReadonlySet<V>> {
  const defaultKey = values.filter((value) => defaultValue.includes(value)).join(',');
  return {
    parse: (raw) => {
      if (raw === null) return new Set(defaultValue);
      if (raw === '') return new Set();
      const members = raw.split(',');
      if (!members.every((member) => (values as readonly string[]).includes(member))) {
        return new Set(defaultValue);
      }
      return new Set(members as V[]);
    },
    serialize: (value) => {
      const key = values.filter((member) => value.has(member)).join(',');
      return key === defaultKey ? null : key;
    },
  };
}

/** Structurally `components/ui`'s `DataTableSort`; restated so `lib` stays below `components`. */
export interface UrlSort {
  columnId: string;
  direction: 'asc' | 'desc';
}

/**
 * `<columnId>:<asc|desc>`, split on the *last* colon (as DataTable's own
 * phone picker does) so a column id may contain one. Which column ids exist
 * is the table's business, not the URL's — `resolveSort` applies that check
 * where the columns are known.
 */
export function sortParam(defaultSort: UrlSort): UrlParamCodec<UrlSort> {
  return {
    parse: (raw) => parseSort(raw) ?? defaultSort,
    serialize: (value) =>
      value.columnId === defaultSort.columnId && value.direction === defaultSort.direction
        ? null
        : `${value.columnId}:${value.direction}`,
  };
}

/** `sortParam` for a table that starts unsorted: `null` is the default. */
export function optionalSortParam(): UrlParamCodec<UrlSort | null> {
  return {
    parse: parseSort,
    serialize: (value) => (value === null ? null : `${value.columnId}:${value.direction}`),
  };
}

function parseSort(raw: string | null): UrlSort | null {
  if (raw === null) return null;
  const at = raw.lastIndexOf(':');
  if (at <= 0) return null;
  const direction = raw.slice(at + 1);
  if (direction !== 'asc' && direction !== 'desc') return null;
  return { columnId: raw.slice(0, at), direction };
}

/** A parsed sort on a column the table does not have falls back to the table's default. */
export function resolveSort(
  sort: UrlSort,
  defaultSort: UrlSort,
  columnIds: readonly string[]
): UrlSort {
  return columnIds.includes(sort.columnId) ? sort : defaultSort;
}
