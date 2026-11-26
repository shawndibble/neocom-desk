import { idSetKey } from './idSetKey';
import { parsePositiveInt } from '@/engine/market/urlState';

export interface UrlParamCodec<T> {
  parse(raw: string | null): T;
  serialize(value: T): string | null;
  readonly debounceMs?: number;
}

export const TEXT_DEBOUNCE_MS = 300;

export function textParam(options: { defaultValue?: string } = {}): UrlParamCodec<string> {
  const defaultValue = options.defaultValue ?? '';
  return {
    parse: (raw) => raw ?? defaultValue,
    serialize: (value) => (value === defaultValue ? null : value),
    debounceMs: TEXT_DEBOUNCE_MS,
  };
}

export function nullableTextParam(): UrlParamCodec<string | null> {
  return { parse: (raw) => raw, serialize: (value) => value };
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

export function optionalEnumParam<V extends string>(values: readonly V[]): UrlParamCodec<V | null> {
  return {
    parse: (raw) => ((values as readonly string[]).includes(raw ?? '') ? (raw as V) : null),
    serialize: (value) => value,
  };
}

export function optionalBoolParam(): UrlParamCodec<boolean | null> {
  return {
    parse: (raw) => (raw === '1' ? true : raw === '0' ? false : null),
    serialize: (value) => (value === null ? null : value ? '1' : '0'),
  };
}

export function optionalIntParam(
  bounds: { min?: number; max?: number } = {}
): UrlParamCodec<number | null> {
  const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = bounds;
  return {
    parse: (raw) => {
      if (raw === null || !/^-?\d+$/.test(raw)) return null;
      const n = Number(raw);
      return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
    },
    serialize: (value) => (value === null ? null : String(value)),
  };
}

export function idListParam(): UrlParamCodec<readonly number[]> {
  return {
    parse: (raw) => {
      if (raw === null || raw === '') return [];
      const ids = raw.split(',').map(parsePositiveInt);
      if (ids.some((id) => id === null)) return [];
      return [...new Set(ids as number[])].sort((a, b) => a - b);
    },
    serialize: (value) => (value.length === 0 ? null : idSetKey(value)),
  };
}

export function orderedIdListParam(): UrlParamCodec<readonly number[]> {
  return {
    parse: (raw) => {
      if (raw === null || raw === '') return [];
      const ids = raw.split(',').map(parsePositiveInt);
      return ids.some((id) => id === null) ? [] : (ids as number[]);
    },
    serialize: (value) => (value.length === 0 ? null : value.join(',')),
  };
}

export function optionalIdParam(): UrlParamCodec<number | null> {
  return {
    parse: parsePositiveInt,
    serialize: (value) => (value === null ? null : String(value)),
  };
}

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

export interface UrlSort {
  columnId: string;
  direction: 'asc' | 'desc';
}

export function sortParam(defaultSort: UrlSort): UrlParamCodec<UrlSort> {
  return {
    parse: (raw) => parseSort(raw) ?? defaultSort,
    serialize: (value) =>
      value.columnId === defaultSort.columnId && value.direction === defaultSort.direction
        ? null
        : `${value.columnId}:${value.direction}`,
  };
}

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

export function resolveSort(
  sort: UrlSort,
  defaultSort: UrlSort,
  columnIds: readonly string[]
): UrlSort {
  return columnIds.includes(sort.columnId) ? sort : defaultSort;
}

export function defineUrlFilter<F extends object>(fields: {
  [K in keyof F]: { key: string; codec: UrlParamCodec<F[K]> };
}): {
  schema: Record<string, UrlParamCodec<unknown>>;
  fieldToParam: Record<keyof F & string, string>;
  emptyParams: Record<string, unknown>;
} {
  const schema: Record<string, UrlParamCodec<unknown>> = {};
  const fieldToParam = {} as Record<keyof F & string, string>;
  const emptyParams: Record<string, unknown> = {};
  for (const field in fields) {
    const { key, codec } = fields[field] as { key: string; codec: UrlParamCodec<unknown> };
    schema[key] = codec;
    fieldToParam[field as keyof F & string] = key;
    emptyParams[key] = codec.parse(null);
  }
  return { schema, fieldToParam, emptyParams };
}
