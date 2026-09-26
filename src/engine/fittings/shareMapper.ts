/**
 * The one place a domain `Fitting` (issue #1531) becomes a Share Link's wire
 * shape (`FittingShareInput`/`DecodedFittingShare`, issue #1530) and back.
 *
 * Two vocabularies meet here that would otherwise silently drift apart:
 *
 * - **Slot category spelling.** The share codec calls the mid rack `'mid'`
 *   (its own compact wire grammar); the domain model calls it `'medium'`
 *   (`FittingSlotKind`, matching `@eveshipfit/dogma-engine`'s own `Slot`
 *   type). `SLOT_TO_SHARE`/`SLOT_FROM_SHARE` are the one translation table.
 * - **Drone activity granularity.** The wire format tracks `active` as a
 *   count within a stack (so a future ticket could share "3 of 5 deployed");
 *   `FittingDrone` (domain) only has an all-or-nothing `state`. Coarsened on
 *   decode: `active > 0` reads as the whole stack being `'active'`. This is
 *   lossless for every `Fitting` this app itself ever produces (EFT loading
 *   and the editor both only ever set a stack fully active or fully bayed),
 *   which is what the round-trip test below actually needs to hold.
 *
 * A Tactical Destroyer's mode and the booster side effects switched on ride
 * the wire's two optional trailing sections; on the domain side the side
 * effects live on the implant set, beside the boosters they belong to.
 *
 * Fighter squadrons ride the wire's fighter section as type, size and — only
 * for one in the bay — a bay flag.
 *
 * Implant sets are a real field on the wire shape.
 * `implantSet` is threaded straight through both directions, `undefined` and
 * `{implants: [], boosters: []}` staying distinct the way
 * `fittingShare.ts`'s own codec keeps them.
 *
 * A `Fitting`'s name rides the version-2 payload (#1718). Version-1 links
 * carry none, so `shareToFitting` still takes a fallback name — callers pass
 * the hull name — used whenever the decoded share has no name of its own.
 */
import type {
  FittingModuleEntry,
  FittingShareInput,
  SlotCategory,
} from '@/engine/fitting/fittingShare';
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
    });
  }

  return {
    hullTypeId: fitting.shipTypeId,
    modules,
    drones: fitting.drones.map((drone) => ({
      typeId: drone.typeId,
      count: drone.quantity,
      active: drone.state === 'active' ? drone.quantity : 0,
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
    // Side effects ride with the boosters that carry them; with no set, there are none.
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
