// Callable input validators shared by the parse modules. Messages are asserted by tests; keep them stable.
import { HttpsError } from 'firebase-functions/v2/https';

/** A string that is one of `allowed`; `details` go on the refusal (a `reason` the client reads). */
export function oneOf<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  details?: { reason: string }
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new HttpsError(
      'invalid-argument',
      `${field} must be one of ${allowed.join(', ')}`,
      ...(details ? [details] : [])
    );
  }
  return value as T;
}

/**
 * The `reason` a server gives an action or sub-action it does not know, so a client tells "this
 * server is older than me" from a refused input. A server from before it sends none.
 */
export const UNKNOWN_ACTION = 'unknown-action';

/** A safe integer in [min, max]. */
export function intIn(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new HttpsError(
      'invalid-argument',
      `${field} must be a whole number from ${min} to ${max}`
    );
  }
  return value;
}

/** `intIn`, or undefined when absent (undefined or null). */
export function optionalIntIn(
  value: unknown,
  field: string,
  min: number,
  max: number
): number | undefined {
  return value === undefined || value === null ? undefined : intIn(value, field, min, max);
}
