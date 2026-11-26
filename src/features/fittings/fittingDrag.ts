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
      fromCargo?: boolean;
    }
  | { kind: 'slot'; rack: FittingSlotKind; index: number }
  | {
      kind: 'charge';
      typeId: number;
      fromCargo: boolean;
      targets: readonly string[];
    }
  | { kind: 'drone'; typeId: number };

export type FittingDropTarget =
  | { kind: 'slot'; rack: FittingSlotKind; index: number; filled: boolean }
  | { kind: 'rack'; rack: FittingSlotKind }
  | { kind: 'drones' }
  | { kind: 'cargo' }
  | { kind: 'ring' };

export interface FittingDropHandlers {
  addType?: boolean;
  moveModule?: boolean;
  loadCharge?: boolean;
  launchDrone?: boolean;
  addCargo?: boolean;
}

function slotKey(rack: FittingSlotKind, index: number): string {
  return `${rack}-${index}`;
}

export function acceptsDrop(
  payload: FittingDragPayload | null,
  target: Exclude<FittingDropTarget, { kind: 'ring' }>,
  handlers: FittingDropHandlers
): boolean {
  if (payload === null) return false;
  if (target.kind === 'cargo') {
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

export type RingDrop =
  | { kind: 'fit'; rack: FittingSlotKind; index: number; typeId: number }
  | { kind: 'load'; typeId: number; fromCargo: boolean; only: ModuleAt[] };

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

export function chargeSlotDropOnly(
  rack: FittingSlotKind,
  index: number,
  alt: boolean
): ModuleAt | undefined {
  return alt || rack !== 'high' ? { slot: rack, slotIndex: index } : undefined;
}

export function chargeDragLights(
  payload: FittingDragPayload | null,
  rack: FittingSlotKind,
  index: number
): 'lit' | 'dim' | null {
  if (payload?.kind !== 'charge') return null;
  return payload.targets.includes(slotKey(rack, index)) ? 'lit' : 'dim';
}

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

export function activeFittingDrag(event: DragEvent): FittingDragPayload | null {
  if (!event.dataTransfer.types.includes(FITTING_DRAG_TYPE)) return null;
  return useFittingDrag.getState().payload;
}

export function dropEffectFor(payload: FittingDragPayload): 'copy' | 'move' {
  return payload.kind === 'slot' ? 'move' : 'copy';
}
