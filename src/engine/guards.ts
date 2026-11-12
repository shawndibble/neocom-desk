/** Shared type guards for parsing untrusted (synced / stored) values. Pure. */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A positive integer: an EVE character, corporation or type id. */
export function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** A non-null, non-array object: the shape stored settings and synced maps take. */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value);
}
