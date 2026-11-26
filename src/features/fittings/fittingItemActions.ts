import { createContext, useContext, useState, type DragEvent, type MouseEvent } from 'react';
import type { CandidateRack } from '@/engine/fittings/candidates';
import type { ModuleAt } from '@/engine/fittings/fittingEdit';
import type {
  Fitting,
  FittingItemState,
  FittingModule,
  FittingModuleResult,
  FittingSlotKind,
} from '@/engine/fittings/types';
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
import type { FittingContext } from './fittingContext';
import type { ChargeLoading } from './useChargeLoading';

export interface ChargePickerInput {
  fitting: Fitting;
  context: FittingContext | null;
  moduleResults: FittingModuleResult[] | null;
}

export interface FittingItemActions {
  typeName: (typeId: number) => string;
  rackOf: (typeId: number) => CandidateRack | null;
  charges: ChargeLoading;

  setState: (rack: FittingSlotKind, index: number, state: FittingItemState) => void;
  unloadCharge: (rack: FittingSlotKind, index: number) => void;
  setGroupState: (at: readonly ModuleAt[], state: FittingItemState) => void;
  chargesFor: (module: FittingModule) => number[];
  chargePickerInput?: () => ChargePickerInput | null;
  unloadGroup: (at: readonly ModuleAt[]) => void;
  copyToAllOfType: (rack: FittingSlotKind, index: number) => void;
  hasVariants: (typeId: number) => boolean;
  openVariations: (rack: FittingSlotKind, index: number) => void;
  canMutate: (typeId: number) => boolean;
  openMutation: (rack: FittingSlotKind, index: number) => void;
  removeAllOfType: (typeId: number) => void;
  remove: (rack: FittingSlotKind, index: number) => void;
  move: (rack: FittingSlotKind, from: number, to: number) => void;
  slotCount: (rack: FittingSlotKind) => number | null;
  copyModule: (module: FittingModule) => void;

  recentFor: (rack: FittingSlotKind) => number[];
  clipboardFor: (rack: FittingSlotKind) => number | null;
  addModule: (rack: FittingSlotKind, index: number, typeId: number) => void;
  browseFor: (rack: FittingSlotKind, index: number) => void;
  fillRack: (rack: FittingSlotKind, typeId: number) => void;

  launchDrones: (typeId: number) => void;
  recallDrones: (typeId: number) => void;
  recallAllDrones: () => void;
  removeDrones: (typeId: number) => void;

  cargoCapacity: number | null;
  cargoUsed: number | null;
  openAddCargo: () => void;
  changeCargoQuantity: (typeId: number) => void;
  removeCargo: (typeId: number) => void;

  canFitFirstFree: (typeId: number, rack: CandidateRack) => boolean;
  fitFirstFree: (typeId: number, rack: CandidateRack) => void;

  dropHandlers: FittingDropHandlers;
  drop: (payload: FittingDragPayload, target: FittingDropTarget, alt: boolean) => void;
}

const FittingItemActionsContext = createContext<FittingItemActions | null>(null);

export const FittingItemActionsProvider = FittingItemActionsContext.Provider;

export function useFittingItemActions(): FittingItemActions | null {
  return useContext(FittingItemActionsContext);
}

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

export function useFittingDropTarget(
  target: FittingDropTarget,
  lands?: (payload: FittingDragPayload | null, handlers: FittingDropHandlers) => boolean
) {
  const actions = useFittingItemActions();
  const drag = useFittingDrag((state) => state.payload);
  const [over, setOver] = useState(false);
  const handlers = actions?.dropHandlers ?? {};
  const takes = (payload: FittingDragPayload | null) =>
    lands
      ? lands(payload, handlers)
      : target.kind !== 'ring' && acceptsDrop(payload, target, handlers);
  const lights = target.kind === 'slot' ? chargeDragLights(drag, target.rack, target.index) : null;
  const props =
    actions === null
      ? {}
      : {
          onDragOver: (event: DragEvent) => {
            const payload = activeFittingDrag(event);
            if (event.defaultPrevented || payload === null || !takes(payload)) {
              setOver(false);
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = dropEffectFor(payload);
            setOver(true);
          },
          onDragLeave: (event: DragEvent) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
          },
          onDrop: (event: DragEvent) => {
            const payload = activeFittingDrag(event);
            setOver(false);
            if (event.defaultPrevented || payload === null || !takes(payload)) return;
            event.preventDefault();
            actions.drop(payload, target, event.altKey);
            endFittingDrag();
          },
        };
  return { props, over, accepts: takes(drag), lights };
}

export function cargoDragPayload(actions: FittingItemActions, typeId: number): FittingDragPayload {
  const rack = actions.rackOf(typeId);
  if (rack !== null && rack !== 'drone') return { kind: 'type', typeId, rack, fromCargo: true };
  return { kind: 'charge', typeId, fromCargo: true, targets: actions.charges.targetsFor(typeId) };
}

export function deleteKeyHandler(onDelete: (() => void) | undefined) {
  if (onDelete === undefined) return undefined;
  return (event: {
    key: string;
    target: EventTarget;
    currentTarget: EventTarget;
    preventDefault: () => void;
  }) => {
    if (event.key !== 'Delete' || event.target !== event.currentTarget) return;
    event.preventDefault();
    onDelete();
  };
}
