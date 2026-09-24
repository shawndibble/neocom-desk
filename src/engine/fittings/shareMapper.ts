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
 * Fighters and implant sets are both real fields on the wire shape.
 * `implantSet` is threaded straight through both directions, `undefined` and
 * `{implants: [], boosters: []}` staying distinct the way
 * `fittingShare.ts`'s own codec keeps them. Fighters have no home on the
 * domain `Fitting` at all — no capital ship fitting exists in the app —
 * and stay dropped in both directions; a fighter bay surviving a share round
 * trip is future tickets' scope, not a regression this mapper introduces.
 *
 * A `Fitting`'s name is deliberately not part of this mapping at all: the
 * share payload never carries it (`fittingShare.ts`'s own header comment), so
 * every caller must supply one on the way back — see `shareToFitting`.
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
    fighters: [],
    cargo: fitting.cargo.map((item) => ({ typeId: item.typeId, quantity: item.quantity })),
    ...(fitting.implantSet === undefined ? {} : { implantSet: fitting.implantSet }),
  };
}

export function shareToFitting(decoded: FittingShareInput, name: string): Fitting {
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
    name,
    shipTypeId: decoded.hullTypeId,
    modules,
    drones: decoded.drones.map((drone) => ({
      typeId: drone.typeId,
      quantity: drone.count,
      state: drone.active > 0 ? 'active' : 'online',
    })),
    cargo: decoded.cargo.map((item) => ({ typeId: item.typeId, quantity: item.quantity })),
    ...(decoded.implantSet === undefined ? {} : { implantSet: decoded.implantSet }),
  };
}
