import type { ExtractionRow } from '@/engine/corpTaxBook/bookView';
import type { ExtractionState } from '@/engine/corpTaxBook/extraction';
import { DAY_MS } from '@/lib/age';

export const FILTER_STATES: readonly ExtractionState[] = [
  'fractured',
  'ready',
  'extracting',
  'expired',
  'cancelled',
];
export const DEFAULT_STATES: ReadonlySet<ExtractionState> = new Set(FILTER_STATES);

export const EXPIRED_KEEP_DAYS = 2;

export const expiryOf = (row: ExtractionRow): string => row.expiresAt ?? row.plannedExpiresAt;

export function isPastExtraction(row: ExtractionRow, now: number): boolean {
  if (row.state === 'cancelled') return true;
  return row.state === 'expired' && now - Date.parse(expiryOf(row)) > EXPIRED_KEEP_DAYS * DAY_MS;
}
