import type { ExtractionState } from '@/engine/corpTaxBook/extraction';

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
