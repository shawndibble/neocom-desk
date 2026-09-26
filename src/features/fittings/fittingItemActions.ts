/**
 * The Fitting editor's item actions (`FittingItemMenu`'s wiring): what every
 * menu and drop does, handed down once by the page in context, plus the
 * small event helpers the menus' triggers share.
 */
import { createContext, useContext, useState, type DragEvent, type MouseEvent } from 'react';
import type { CandidateRack } from '@/engine/fittings/candidates';
import type { ModuleAt } from '@/engine/fittings/fittingEdit';
import type { FittingItemState, FittingModule, FittingSlotKind } from '@/engine/fittings/types';
import {
  acceptsDrop,
  activeFittingDrag,
  chargeDragLights,
  dropEffectFor,
  endFittingDrag,
  useFittingDrag,
  type FittingDragPayload,
  type FittingDropHandlers,
  type FittingDropTarget,
} from './fittingDrag';
import type { ChargeLoading } from './useChargeLoading';

/** Everything the menus (and the drops they stand in for) do — the page's own edits. */
export interface FittingItemActions {
  typeName: (typeId: number) => string;
  showInfo: (typeId: number, name: string) => void;
  charges: ChargeLoading;

  setState: (rack: FittingSlotKind, index: number, state: FittingItemState) => void;
  unloadCharge: (rack: FittingSlotKind, index: number) => void;
  /** A weapon group's state (the stats' Offense rows), in one edit. */
  setGroupState: (at: readonly ModuleAt[], state: FittingItemState) => void;
  /** Every charge `module` takes, whether carried or not (alphabetical) — worked out on the engine, so ask only when a menu opens. */
  chargesFor: (module: FittingModule) => number[];
  /** A weapon group's charges out, in one edit. */
  unloadGroup: (at: readonly ModuleAt[]) => void;
  copyToAllOfType: (rack: FittingSlotKind, index: number) => void;
  /** A type's meta variants (itself left out), for "Swap for meta variant ▸". */
  variantsOf: (typeId: number) => { typeId: number; name: string }[];
  swapType: (rack: FittingSlotKind, index: number, typeId: number) => void;
  removeAllOfType: (typeId: number) => void;
  remove: (rack: FittingSlotKind, index: number) => void;
  /** Moves a module within its rack, swapping with whatever sat at `to`. */
  move: (rack: FittingSlotKind, from: number, to: number) => void;
  /** How many slots a rack has; null before the ship data. */
  slotCount: (rack: FittingSlotKind) => number | null;
  /** Keeps a module's type for "Paste module" into an empty slot. */
  copyModule: (module: FittingModule) => void;

  /** Types most recently fitted to a rack, newest first. */
  recentFor: (rack: FittingSlotKind) => number[];
  /** The copied module's type, when it goes in this rack. */
  clipboardFor: (rack: FittingSlotKind) => number | null;
  addModule: (rack: FittingSlotKind, index: number, typeId: number) => void;
  /** Opens the Add panel on a slot — "Add module ▸ Browse…". */
  browseFor: (rack: FittingSlotKind, index: number) => void;
  fillRack: (rack: FittingSlotKind, typeId: number) => void;

  launchDrones: (typeId: number) => void;
  recallDrones: (typeId: number) => void;
  recallAllDrones: () => void;
  removeDrones: (typeId: number) => void;

  /** m3 the hold takes as fitted; null before the ship data. */
  cargoCapacity: number | null;
  /** m3 the cargo takes up; null before the item volumes. */
  cargoUsed: number | null;
  /** Opens the Add panel on its Cargo tab. */
  openAddCargo: () => void;
  /** Opens the quantity dialog for a cargo item. */
  changeCargoQuantity: (typeId: number) => void;
  removeCargo: (typeId: number) => void;

  /** An Add panel item into its rack's first free slot (a drone: into the bay); false when there is none. */
  canFitFirstFree: (typeId: number, rack: CandidateRack) => boolean;
  fitFirstFree: (typeId: number, rack: CandidateRack) => void;

  /** The drops this surface takes; everything off without a fine pointer. */
  dropHandlers: FittingDropHandlers;
  /** A drop the List handles (the Ring has its own props for modules). `alt`: load only that module. */
  drop: (payload: FittingDragPayload, target: FittingDropTarget, alt: boolean) => void;
}

const FittingItemActionsContext = createContext<FittingItemActions | null>(null);

export const FittingItemActionsProvider = FittingItemActionsContext.Provider;

/** The page's item actions, or null where the editor isn't (a read-only preview). */
export function useFittingItemActions(): FittingItemActions | null {
  return useContext(FittingItemActionsContext);
}

/**
 * Opens an item's context menu from a plain click or Enter — for a tile whose
 * click has nothing else to do (a cargo tile), so it needs no ⋮ of its own.
 * Radix's trigger answers the `contextmenu` event, opened where the pointer
 * is, or at the tile for a keyboard click.
 */
export function openItemMenu(event: MouseEvent<HTMLElement>) {
  const target = event.currentTarget;
  const box = target.getBoundingClientRect();
  const fromKeyboard = event.detail === 0;
  target.dispatchEvent(
    new globalThis.MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: fromKeyboard ? box.left + box.width / 2 : event.clientX,
      clientY: fromKeyboard ? box.bottom : event.clientY,
    })
  );
}

/**
 * Makes an element a drop target for the List's drags (the Ring's tiles
 * handle their own): the props to spread on it, whether a drag is over it,
 * whether the drag in progress would land, and — for a slot — whether a
 * charge drag lights or dims it.
 */
export function useFittingDropTarget(target: FittingDropTarget) {
  const actions = useFittingItemActions();
  const drag = useFittingDrag((state) => state.payload);
  const [over, setOver] = useState(false);
  const handlers = actions?.dropHandlers ?? {};
  const lights = target.kind === 'slot' ? chargeDragLights(drag, target.rack, target.index) : null;
  const props =
    actions === null
      ? {}
      : {
          onDragOver: (event: DragEvent) => {
            const payload = activeFittingDrag(event);
            if (payload === null || !acceptsDrop(payload, target, handlers)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = dropEffectFor(payload);
            setOver(true);
          },
          // Moving onto a child fires dragleave on the target; only leaving it counts.
          onDragLeave: (event: DragEvent) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
          },
          onDrop: (event: DragEvent) => {
            const payload = activeFittingDrag(event);
            setOver(false);
            if (payload === null || !acceptsDrop(payload, target, handlers)) return;
            event.preventDefault();
            actions.drop(payload, target, event.altKey);
            endFittingDrag();
          },
        };
  return { props, over, accepts: acceptsDrop(drag, target, handlers), lights };
}

/** The Del key's edit on a focused module (the item menu's Remove), else nothing. */
export function deleteKeyHandler(onDelete: (() => void) | undefined) {
  if (onDelete === undefined) return undefined;
  return (event: {
    key: string;
    target: EventTarget;
    currentTarget: EventTarget;
    preventDefault: () => void;
  }) => {
    // Only the item itself — a Delete typed into one of its fields stays the field's.
    if (event.key !== 'Delete' || event.target !== event.currentTarget) return;
    event.preventDefault();
    onDelete();
  };
}
