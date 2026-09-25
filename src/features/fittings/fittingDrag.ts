/**
 * What is being dragged onto the Ring right now (scope decision
 * `20260924-205720`): an Add panel item, or a fitted module being moved.
 *
 * HTML drag and drop hides the payload until `drop` — `dragover` can read
 * only the MIME types — yet a slot must decide on `dragover` whether it will
 * accept, and the ring highlights the racks that would. So the payload lives
 * here for the length of the drag, set on `dragstart` and cleared on
 * `dragend`, and `dataTransfer` carries only a marker type.
 */
import type { DragEvent } from 'react';
import { create } from 'zustand';
import type { CandidateRack } from '@/engine/fittings/candidates';
import type { FittingSlotKind } from '@/engine/fittings/types';

export type FittingDragPayload =
  | { kind: 'type'; typeId: number; rack: CandidateRack }
  | { kind: 'slot'; rack: FittingSlotKind; index: number };

/** The marker `dataTransfer` type, so a drop from outside the app is ignored. */
export const FITTING_DRAG_TYPE = 'application/x-neocom-fitting';

interface FittingDragState {
  payload: FittingDragPayload | null;
}

export const useFittingDrag = create<FittingDragState>(() => ({ payload: null }));

export function startFittingDrag(event: DragEvent, payload: FittingDragPayload): void {
  event.dataTransfer.setData(FITTING_DRAG_TYPE, JSON.stringify(payload));
  event.dataTransfer.effectAllowed = payload.kind === 'type' ? 'copy' : 'move';
  useFittingDrag.setState({ payload });
}

export function endFittingDrag(): void {
  useFittingDrag.setState({ payload: null });
}

/** The drag in progress, when it came from this app; null for anything else. */
export function activeFittingDrag(event: DragEvent): FittingDragPayload | null {
  if (!event.dataTransfer.types.includes(FITTING_DRAG_TYPE)) return null;
  return useFittingDrag.getState().payload;
}
