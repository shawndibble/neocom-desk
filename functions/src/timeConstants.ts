// Lives in functions/src (deploy uploads functions/ alone); src/lib/age re-exports it. Keep it import-free.
/** Milliseconds in a minute, an hour, a day. */
export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` of a UTC instant in ms (EVE time). */
export const utcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** `YYYY-MM-DD` of an ISO instant (or a day), as written: its UTC (EVE) day. */
export const utcDayOf = (iso: string): string => iso.slice(0, 10);
