import type { IncursionState } from '@/engine/incursions/incursionRows';

/**
 * An Incursion's state as a tinted word (§6c verdict): no fill, which would
 * read as clickable, and no accent. Shared by Route Safety's panel and the
 * Overview card so the two never colour the same state differently.
 */
export const INCURSION_STATE_TONE: Record<IncursionState, string> = {
  mobilizing: 'text-warning',
  established: 'text-text',
  withdrawing: 'text-text-dim',
};
