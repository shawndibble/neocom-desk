/**
 * Local calendar days, shared by both deadline boards.
 *
 * Days are **local calendar days, not rolling 24-hour windows**: a pilot
 * reading "Tuesday" means their own Tuesday, so this reads the machine's zone
 * deliberately and takes no zone argument.
 *
 * Implemented by zeroing a `Date`'s clock fields rather than by subtracting a
 * modulus: a `ms % 86_400_000` is an hour wrong for half the year on either
 * side of a DST change, and the error is invisible until someone's event files
 * under the wrong heading. Both boards had their own body for this before —
 * one rule, two implementations, and the DST prose duplicated with them.
 */
export function localMidnight(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** The local midnight one calendar day after `dayStartMs`. DST-safe for the same reason. */
export function nextLocalDay(dayStartMs: number): number {
  const date = new Date(dayStartMs);
  date.setDate(date.getDate() + 1);
  return date.getTime();
}
