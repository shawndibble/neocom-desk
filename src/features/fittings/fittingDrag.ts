/**
 * What is being dragged onto the Ring or the List right now (scope decision
 * `20260924-205720`): an Add panel item, a fitted module being moved, a
 * charge out of Cargo (or the Add panel's Charges tab), or a drone from the
 * bay.
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
  | { kind: 'slot'; rack: FittingSlotKind; index: number }
  | {
      kind: 'charge';
      typeId: number;
      /** Out of the Fitting's own cargo (debited), rather than the Add panel. */
      fromCargo: boolean;
      /**
       * The `moduleKey`s of the modules that take it, worked out once at
       * `dragstart` — the slots that light up, and the only ones a drop lands on.
       */
      targets: readonly string[];
    }
  /** A drone type already in the bay, dragged to launch it. */
  | { kind: 'drone'; typeId: number };

/** Where a drag can land. */
export type FittingDropTarget =
  | { kind: 'slot'; rack: FittingSlotKind; index: number; filled: boolean }
  /** A rack's heading in the List: a module goes in its first free slot, a charge into every module that takes it (with one in this rack). */
  | { kind: 'rack'; rack: FittingSlotKind }
  /** The Drones rack: a drone launches. */
  | { kind: 'drones' };

/** Which drops the surface handles at all — a drop it has no handler for is never offered. */
export interface FittingDropHandlers {
  /** An Add panel module into a slot (or a rack's first free one). */
  addType?: boolean;
  /** A fitted module along its rack. */
  moveModule?: boolean;
  loadCharge?: boolean;
  /** A drone, from the bay or the Add panel, launched. */
  launchDrone?: boolean;
}

/** The `moduleKey` of a slot, as `targets` holds them. */
function slotKey(rack: FittingSlotKind, index: number): string {
  return `${rack}-${index}`;
}

/**
 * Whether the drag in progress lands on `target`: the one rule both the
 * highlight and the drop read. A module stays in its own rack; a charge goes
 * only where one of its `targets` is; a drone only onto the Drones rack.
 */
export function acceptsDrop(
  payload: FittingDragPayload | null,
  target: FittingDropTarget,
  handlers: FittingDropHandlers
): boolean {
  if (payload === null) return false;
  switch (payload.kind) {
    case 'type':
      if (payload.rack === 'drone') return target.kind === 'drones' && !!handlers.launchDrone;
      return target.kind !== 'drones' && target.rack === payload.rack && !!handlers.addType;
    case 'slot':
      return (
        target.kind === 'slot' &&
        target.rack === payload.rack &&
        target.index !== payload.index &&
        !!handlers.moveModule
      );
    case 'charge':
      if (!handlers.loadCharge || target.kind === 'drones') return false;
      if (target.kind === 'slot')
        return payload.targets.includes(slotKey(target.rack, target.index));
      return payload.targets.some((key) => key.startsWith(`${target.rack}-`));
    case 'drone':
      return target.kind === 'drones' && !!handlers.launchDrone;
  }
}

/** A slot a charge drag would load into — lit while the drag lasts, the rest dimmed. */
export function chargeDragLights(
  payload: FittingDragPayload | null,
  rack: FittingSlotKind,
  index: number
): 'lit' | 'dim' | null {
  if (payload?.kind !== 'charge') return null;
  return payload.targets.includes(slotKey(rack, index)) ? 'lit' : 'dim';
}

/** The marker `dataTransfer` type, so a drop from outside the app is ignored. */
export const FITTING_DRAG_TYPE = 'application/x-neocom-fitting';

interface FittingDragState {
  payload: FittingDragPayload | null;
}

export const useFittingDrag = create<FittingDragState>(() => ({ payload: null }));

export function startFittingDrag(event: DragEvent, payload: FittingDragPayload): void {
  event.dataTransfer.setData(FITTING_DRAG_TYPE, JSON.stringify(payload));
  event.dataTransfer.effectAllowed = payload.kind === 'slot' ? 'move' : 'copy';
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

/** The drop effect a payload shows while over a target that takes it. */
export function dropEffectFor(payload: FittingDragPayload): 'copy' | 'move' {
  return payload.kind === 'slot' ? 'move' : 'copy';
}
