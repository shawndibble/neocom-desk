import type { ExtractionState } from '@/engine/corpTaxBook/extraction';

/** Filter order, and the order everywhere else a chunk's state is listed: what is minable first. */
export const FILTER_STATES: readonly ExtractionState[] = [
  'fractured',
  'ready',
  'extracting',
  'expired',
  'cancelled',
];
/** Expired is history: off until asked for, so the live chunks lead. */
export const DEFAULT_STATES: ReadonlySet<ExtractionState> = new Set([
  'fractured',
  'ready',
  'extracting',
]);
