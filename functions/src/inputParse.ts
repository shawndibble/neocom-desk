import { HttpsError } from 'firebase-functions/v2/https';

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

export function intIn(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new HttpsError(
      'invalid-argument',
      `${field} must be a whole number from ${min} to ${max}`
    );
  }
  return value;
}

export function optionalIntIn(
  value: unknown,
  field: string,
  min: number,
  max: number
): number | undefined {
  return value === undefined || value === null ? undefined : intIn(value, field, min, max);
}
