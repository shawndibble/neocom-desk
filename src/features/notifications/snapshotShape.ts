/**
 * Declarative guards for the snapshots `pollerState.ts` persists. The
 * TypeScript shapes live in `engine/notificationDiffs.ts` (and its siblings);
 * each polled domain describes the same shape here once, and `shapeGuard`
 * turns it into the runtime check a stored baseline is parsed with.
 *
 * The description is keyed by the type's own fields, every one required in the
 * spec, so adding a field to a snapshot type fails the typecheck until the
 * description says what a stored baseline may look like. Each field's check is
 * typed to its field, so `is.number` cannot describe a `string`. What the
 * description cannot say is how *wide* a check is (a `number | null` field
 * given `is.number` still compiles); `staleShapes.test.ts` pins that.
 *
 * Backward compatibility is therefore visible at the declaration: a field
 * added after snapshots already existed is `is.optional(...)` (absent stays
 * readable), anything else is required and a baseline without it is discarded.
 */

import { isRecord } from '@/engine/guards';

/** A check for one field, narrowing to that field's type. */
type Check<T> = (raw: unknown) => raw is T;

/** One check per field of `T`, optional fields included. */
type ShapeSpec<T> = { readonly [K in keyof T]-?: Check<T[K]> };

/**
 * Builds a guard for `T` from one check per field. A value passes when it is
 * an object and every field's check accepts it; extra stored fields are
 * ignored. An absent field is `undefined` to its check, which is how
 * `is.optional` admits it.
 */
export function shapeGuard<T extends object>(spec: ShapeSpec<T>): Check<T> {
  const fields = Object.entries(spec) as [string, Check<unknown>][];
  return (raw): raw is T => isRecord(raw) && fields.every(([name, check]) => check(raw[name]));
}

/** The building blocks for a `shapeGuard` description. */
export const is = {
  /** Any `typeof` number — NaN and Infinity included, as a stored number always was. */
  number: (raw: unknown): raw is number => typeof raw === 'number',
  /** A finite number: for epoch-ms fields an unparseable date would otherwise poison as NaN. */
  finite: (raw: unknown): raw is number => Number.isFinite(raw),
  string: (raw: unknown): raw is string => typeof raw === 'string',
  boolean: (raw: unknown): raw is boolean => typeof raw === 'boolean',
  /** The inner check, or an explicit `null` (never absent). */
  nullable:
    <T>(check: Check<T>): Check<T | null> =>
    (raw): raw is T | null =>
      raw === null || check(raw),
  /** The inner check, or absent. `null` is not absent. */
  optional:
    <T>(check: Check<T>): Check<T | undefined> =>
    (raw): raw is T | undefined =>
      raw === undefined || check(raw),
  /** One of a closed list of literals. */
  oneOf:
    <const T extends readonly unknown[]>(values: T): Check<T[number]> =>
    (raw): raw is T[number] =>
      values.includes(raw),
  /** An array whose every element passes `check`. */
  arrayOf:
    <T>(check: Check<T>): Check<readonly T[]> =>
    (raw): raw is readonly T[] =>
      Array.isArray(raw) && raw.every(check),
} as const;
