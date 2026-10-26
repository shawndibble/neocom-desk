const DAY_MS = 86_400_000;

/**
 * An Extraction's window in days: the time from the pull's start to the chunk
 * arriving, rounded to the nearest whole day (a 6 d 3 h pull is 6 days).
 * Never negative.
 */
export function extractionWindowDays(startedAt: string, chunkArrivalAt: string): number {
  const ms = Date.parse(chunkArrivalAt) - Date.parse(startedAt);
  return Math.max(0, Math.round(ms / DAY_MS));
}
