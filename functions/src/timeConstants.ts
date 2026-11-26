export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

export const utcDay = (ms: number = Date.now()): string => new Date(ms).toISOString().slice(0, 10);

export const utcDayOf = (iso: string): string => iso.slice(0, 10);
