import type { IncursionState } from '@/engine/incursions/incursionRows';

export const INCURSION_STATE_TONE: Record<IncursionState, string> = {
  mobilizing: 'text-warning',
  established: 'text-text',
  withdrawing: 'text-text-dim',
};
