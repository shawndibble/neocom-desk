import type { ExtractionRow } from '@/engine/corpTaxBook/bookView';
import type { ExtractionState } from '@/engine/corpTaxBook/extraction';
import { DAY_MS } from '@/lib/age';

/** Filter order, and the order everywhere else a chunk's state is listed: what is minable first. */
export const FILTER_STATES: readonly ExtractionState[] = [
  'fractured',
  'ready',
  'extracting',
  'expired',
  'cancelled',
];
/** Every state shows from the start, Expired history beside the live chunks; a chip narrows it. */
export const DEFAULT_STATES: ReadonlySet<ExtractionState> = new Set(FILTER_STATES);

/** How long an expired chunk stays on the timeline and in the main list before it is history. */
export const EXPIRED_KEEP_DAYS = 2;

/** When the chunk expired, or is planned to. */
export const expiryOf = (row: ExtractionRow): string => row.expiresAt ?? row.plannedExpiresAt;

/**
 * History: cancelled, or expired more than `EXPIRED_KEEP_DAYS` ago. The timeline drops it and the
 * Extractions tab lists it apart, under "Past extractions", so the live list never grows without end.
 */
export function isPastExtraction(row: ExtractionRow, now: number): boolean {
  if (row.state === 'cancelled') return true;
  return row.state === 'expired' && now - Date.parse(expiryOf(row)) > EXPIRED_KEEP_DAYS * DAY_MS;
}
