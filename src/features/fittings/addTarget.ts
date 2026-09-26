import type { CandidateRack } from '@/engine/fittings/candidates';
import type { FittingSlotKind } from '@/engine/fittings/types';

/** Where the Fitting editor's Add lands (issue #1533): one chosen slot, the drone bay, or the cargo hold. */
export type AddTarget =
  | { kind: 'slot'; slot: FittingSlotKind; slotIndex: number }
  | { kind: 'drone' }
  | { kind: 'cargo' };

export function targetRack(target: AddTarget): CandidateRack | 'cargo' {
  return target.kind === 'slot' ? target.slot : target.kind;
}
