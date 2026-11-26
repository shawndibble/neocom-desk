import type {
  FittingModuleEntry,
  FittingShareInput,
  SlotCategory,
} from '@/engine/fittings/fittingShare';
import {
  FITTING_SLOT_KINDS,
  type Fitting,
  type FittingModule,
  type FittingSlotKind,
} from './types';

const SLOT_TO_SHARE: Record<FittingSlotKind, SlotCategory> = {
  high: 'high',
  medium: 'mid',
  low: 'low',
  rig: 'rig',
  subsystem: 'subsystem',
};

export function fittingToShareInput(fitting: Fitting): FittingShareInput {
  const modules: Record<SlotCategory, FittingModuleEntry[]> = {
    high: [],
    mid: [],
    low: [],
    rig: [],
    subsystem: [],
  };
  for (const module of fitting.modules) {
    modules[SLOT_TO_SHARE[module.slot]].push({
      slotIndex: module.slotIndex,
      typeId: module.typeId,
      state: module.state,
      ...(module.chargeTypeId === undefined ? {} : { chargeTypeId: module.chargeTypeId }),
      ...(module.mutation === undefined ? {} : { mutation: module.mutation }),
    });
  }

  return {
    hullTypeId: fitting.shipTypeId,
    modules,
    drones: fitting.drones.map((drone) => ({
      typeId: drone.typeId,
      count: drone.quantity,
      active: drone.state === 'active' ? drone.quantity : 0,
      ...(drone.mutation === undefined ? {} : { mutation: drone.mutation }),
    })),
    fighters: (fitting.fighters ?? []).map((fighter) => ({
      typeId: fighter.typeId,
      count: fighter.quantity,
      ...(fighter.state === 'online' ? { inBay: true } : {}),
    })),
    cargo: fitting.cargo.map((item) => ({ typeId: item.typeId, quantity: item.quantity })),
    ...(fitting.implantSet === undefined
      ? {}
      : {
          implantSet: {
            implants: fitting.implantSet.implants,
            boosters: fitting.implantSet.boosters,
          },
        }),
    ...(fitting.implantSet?.boosterSideEffects?.length
      ? { boosterSideEffects: fitting.implantSet.boosterSideEffects }
      : {}),
    ...(fitting.mode === undefined ? {} : { mode: fitting.mode }),
    name: fitting.name,
  };
}

export function shareToFitting(decoded: FittingShareInput, fallbackName: string): Fitting {
  const modules: FittingModule[] = FITTING_SLOT_KINDS.flatMap((slot) =>
    decoded.modules[SLOT_TO_SHARE[slot]].map((entry): FittingModule => ({
      slot,
      slotIndex: entry.slotIndex,
      typeId: entry.typeId,
      state: entry.state,
      ...(entry.chargeTypeId === undefined ? {} : { chargeTypeId: entry.chargeTypeId }),
      ...(entry.mutation === undefined ? {} : { mutation: entry.mutation }),
    }))
  );

  return {
    name: decoded.name ?? fallbackName,
    shipTypeId: decoded.hullTypeId,
    modules,
    drones: decoded.drones.map((drone) => ({
      typeId: drone.typeId,
      quantity: drone.count,
      state: drone.active > 0 ? 'active' : 'online',
      ...(drone.mutation === undefined ? {} : { mutation: drone.mutation }),
    })),
    cargo: decoded.cargo.map((item) => ({ typeId: item.typeId, quantity: item.quantity })),
    ...(decoded.fighters.length === 0
      ? {}
      : {
          fighters: decoded.fighters.map((fighter) => ({
            typeId: fighter.typeId,
            quantity: fighter.count,
            state: fighter.inBay ? ('online' as const) : ('active' as const),
          })),
        }),
    ...(decoded.implantSet === undefined
      ? {}
      : {
          implantSet: {
            ...decoded.implantSet,
            ...(decoded.boosterSideEffects?.length
              ? { boosterSideEffects: decoded.boosterSideEffects }
              : {}),
          },
        }),
    ...(decoded.mode === undefined ? {} : { mode: decoded.mode }),
  };
}
