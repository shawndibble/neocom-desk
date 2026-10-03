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
import type { ModuleAt } from '@/engine/fittings/fittingEdit';
import type { SlotLayout } from '@/engine/fittings/ringLayout';
import { moduleKey } from '@/engine/fittings/skillGaps';
import {
  sortFittingModules,
  type FittingModule,
  type FittingSlotKind,
} from '@/engine/fittings/types';

export type FittingDragPayload =
  | {
      kind: 'type';
      typeId: number;
      rack: CandidateRack;
      /** A module out of the Fitting's own cargo: fitting it takes one off the stack. */
      fromCargo?: boolean;
    }
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
  | { kind: 'drones' }
  /** The cargo hold: an Add panel item or charge goes in, one of it. */
  | { kind: 'cargo' }
  /**
   * Anywhere else on the Ring: the item goes where it should (`ringDropFor`).
   * Whether it lands depends on the fitting, so `acceptsDrop` never sees it.
   */
  | { kind: 'ring' };

/** Which drops the surface handles at all — a drop it has no handler for is never offered. */
export interface FittingDropHandlers {
  /** An Add panel module into a slot (or a rack's first free one). */
  addType?: boolean;
  /** A fitted module along its rack. */
  moveModule?: boolean;
  loadCharge?: boolean;
  /** A drone, from the bay or the Add panel, launched. */
  launchDrone?: boolean;
  /** An Add panel item or charge put in the cargo. */
  addCargo?: boolean;
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
  target: Exclude<FittingDropTarget, { kind: 'ring' }>,
  handlers: FittingDropHandlers
): boolean {
  if (payload === null) return false;
  if (target.kind === 'cargo') {
    // An item already in the hold dropped back would only inflate its stack.
    const fromPanel = (payload.kind === 'type' || payload.kind === 'charge') && !payload.fromCargo;
    return fromPanel && !!handlers.addCargo;
  }
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

/** What a drop on the Ring's open space does, once `ringDropFor` has placed it. */
export type RingDrop =
  | { kind: 'fit'; rack: FittingSlotKind; index: number; typeId: number }
  | { kind: 'load'; typeId: number; fromCargo: boolean; only: ModuleAt[] };

/**
 * Where a drag dropped anywhere on the Ring — not on a slot that takes it —
 * goes, so only replacing what a slot holds needs aiming: a module into its
 * rack's first free slot; a high-slot charge into every high module that
 * takes it; a mid or low charge into its one taker, or with several the
 * first still unloaded. Null where it has nowhere obvious to go (a full
 * rack, every taker loaded), and for moves and drones, which have their own
 * targets.
 */
export function ringDropFor(
  payload: FittingDragPayload | null,
  modules: readonly FittingModule[],
  slotCounts: SlotLayout | null
): RingDrop | null {
  if (payload?.kind === 'type') {
    const { rack, typeId } = payload;
    if (rack === 'drone' || slotCounts === null) return null;
    const taken = new Set(modules.filter((m) => m.slot === rack).map((m) => m.slotIndex));
    for (let index = 0; index < slotCounts[rack]; index++)
      if (!taken.has(index)) return { kind: 'fit', rack, index, typeId };
    return null;
  }
  if (payload?.kind !== 'charge') return null;
  const takers = sortFittingModules(modules.filter((m) => payload.targets.includes(moduleKey(m))));
  const highs = takers.filter((m) => m.slot === 'high');
  const picked =
    highs.length > 0
      ? highs
      : takers.length === 1
        ? takers
        : takers.filter((m) => m.chargeTypeId === undefined).slice(0, 1);
  if (picked.length === 0) return null;
  return {
    kind: 'load',
    typeId: payload.typeId,
    fromCargo: payload.fromCargo,
    only: picked.map(({ slot, slotIndex }) => ({ slot, slotIndex })),
  };
}

/**
 * Which modules a charge dropped on one slot loads: a high slot's goes into
 * every module that takes it (Alt for just that one), a mid or low slot's
 * replaces only what that slot holds. Undefined for all of them.
 */
export function chargeSlotDropOnly(
  rack: FittingSlotKind,
  index: number,
  alt: boolean
): ModuleAt | undefined {
  return alt || rack !== 'high' ? { slot: rack, slotIndex: index } : undefined;
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
