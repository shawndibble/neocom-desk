/**
 * Shared type guards for parsing untrusted (ESI / stored / callable-input)
 * values. Hand-mirrors `src/engine/guards.ts` — this is a separate package
 * with its own tsconfig and no `@/` alias, so it cannot import it.
 * `src/functionsParity.test.ts` asserts the two copies agree.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A non-null, non-array object: the shape an ESI object or a callable's input takes. */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value);
}
