import { DAY_MS } from '@/lib/age';

export function extractionWindowDays(startedAt: string, chunkArrivalAt: string): number {
  const ms = Date.parse(chunkArrivalAt) - Date.parse(startedAt);
  return Math.max(0, Math.round(ms / DAY_MS));
}
