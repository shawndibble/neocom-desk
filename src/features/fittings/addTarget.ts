import type { CandidateRack } from '@/engine/fittings/candidates';
import type { FittingSlotKind } from '@/engine/fittings/types';

/** Where the Fitting editor's Add lands (issue #1533): one chosen slot, or the drone bay. */
export type AddTarget =
  { kind: 'slot'; slot: FittingSlotKind; slotIndex: number } | { kind: 'drone' };

export function targetRack(target: AddTarget): CandidateRack {
  return target.kind === 'drone' ? 'drone' : target.slot;
}
