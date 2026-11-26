import { isRecord } from '@/engine/guards';

type Check<T> = (raw: unknown) => raw is T;

type ShapeSpec<T> = { readonly [K in keyof T]-?: Check<T[K]> };

export function shapeGuard<T extends object>(spec: ShapeSpec<T>): Check<T> {
  const fields = Object.entries(spec) as [string, Check<unknown>][];
  return (raw): raw is T => isRecord(raw) && fields.every(([name, check]) => check(raw[name]));
}

export const is = {
  number: (raw: unknown): raw is number => typeof raw === 'number',
  finite: (raw: unknown): raw is number => Number.isFinite(raw),
  string: (raw: unknown): raw is string => typeof raw === 'string',
  boolean: (raw: unknown): raw is boolean => typeof raw === 'boolean',
  nullable:
    <T>(check: Check<T>): Check<T | null> =>
    (raw): raw is T | null =>
      raw === null || check(raw),
  optional:
    <T>(check: Check<T>): Check<T | undefined> =>
    (raw): raw is T | undefined =>
      raw === undefined || check(raw),
  oneOf:
    <const T extends readonly unknown[]>(values: T): Check<T[number]> =>
    (raw): raw is T[number] =>
      values.includes(raw),
  arrayOf:
    <T>(check: Check<T>): Check<readonly T[]> =>
    (raw): raw is readonly T[] =>
      Array.isArray(raw) && raw.every(check),
} as const;
