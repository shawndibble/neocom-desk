import type { FittingItemState } from '@/engine/fittings/types';

/** One colour per module state, shared by the ring's tile border and the list's state text. */
export const MODULE_STATE_STYLE: Record<FittingItemState, { text: string; border: string }> = {
  offline: { text: 'text-text-dim', border: 'border-text-dim' },
  online: { text: 'text-accent', border: 'border-accent' },
  active: { text: 'text-success', border: 'border-success' },
  overload: { text: 'text-warning', border: 'border-warning' },
};
