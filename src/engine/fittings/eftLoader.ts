/**
 * Turns a parsed EFT fit (`engine/import/eftFit.ts`) into a domain `Fitting`
 * (issue #1531) — the "Load EFT" half of #1532. `parseEftFit` only reads the
 * paste's text structure (names, an optional loaded charge, section blank
 * lines it deliberately doesn't track); this is where a name becomes a
 * typeId and a typeId becomes a rack.
 *
 * A resolved item's rack comes from `FittingSlotMap` (`scripts/build-fitting-
 * slots.mjs`), never from its position in the pasted text: EFT's section
 * order isn't reliable enough to infer a slot from (a fit with cargo but no
 * drones has one trailing "xN" group, which by position alone reads as
 * drones; a spare module tucked in cargo would misplace into a rack). A type
 * with no rack in that map (ammo, boosters, ships, anything the map has
 * nothing for) is cargo instead — that is what "cargo" *means* once slot
 * membership is known, not a fallback for whatever position parsing missed.
 *
 * `parseEftFit` strips a module's `/offline` suffix without exposing it
 * (matching in-game import, per its own doc comment) — every resolved module
 * here loads `'active'`, since there is no signal left to say otherwise. A
 * drone-bay stack loads `'online'` (carried, not deployed): an EFT paste
 * describes what a fit *carries*, not which drones happen to be in space
 * right now.
 */
import { parseEftFit, type EftItem } from '@/engine/import/eftFit';
import { MAX_SLOTS_PER_CATEGORY } from '@/engine/fitting/fittingShare';
import type { FittingSlotAssignment } from '@/sde/types';
import {
  sortFittingModules,
  type Fitting,
  type FittingCargoItem,
  type FittingDrone,
  type FittingModule,
  type FittingSlotKind,
} from './types';

export interface EftUnresolvedItem {
  line: number;
  text: string;
  reason: string;
}

/** A `TypeCatalog` value, matching `features/skills/typeCatalog.ts`'s shape. */
export interface EftTypeLookup {
  get(nameLowercased: string): { typeID: number } | undefined;
}

export type EftSlotLookup = Readonly<Record<string, FittingSlotAssignment>>;

export type EftLoadResult =
  | {
      hullTypeId: number;
      modules: FittingModule[];
      drones: FittingDrone[];
      cargo: FittingCargoItem[];
      unresolved: EftUnresolvedItem[];
    }
  | { hullTypeId: null; unresolved: EftUnresolvedItem[] };

/**
 * Same shape as `eftFit.ts`'s own `QUANTITY_SUFFIX` — duplicated rather than
 * imported, since that parser folds a missing suffix and an explicit `x1`
 * into the same `quantity: 1` and exposes neither the raw line nor which one
 * it was. Whether a count was actually *written* is exactly the signal that
 * tells a fitted module (never gets one) apart from a single spare sitting
 * in cargo (EVE's own export always writes one, even for `x1`).
 */
const HAS_QUANTITY_SUFFIX = /^.*\S\s+x\d+$/i;

function resolveTypeId(name: string, typeByName: EftTypeLookup): number | null {
  return typeByName.get(name.toLowerCase())?.typeID ?? null;
}

export function loadEftFitting(
  text: string,
  typeByName: EftTypeLookup,
  slotByTypeId: EftSlotLookup
): EftLoadResult {
  const fit = parseEftFit(text);
  const lines = text.split(/\r\n|\r|\n/);
  const unresolved: EftUnresolvedItem[] = fit.errors.map((e) => ({
    line: e.line,
    text: e.text,
    reason: e.reason,
  }));

  const hullTypeId = resolveTypeId(fit.shipName, typeByName);
  if (hullTypeId === null) {
    unresolved.push({ line: fit.headerLine, text: fit.shipName, reason: 'unknown ship' });
    return { hullTypeId: null, unresolved };
  }

  const modules: FittingModule[] = [];
  const drones: FittingDrone[] = [];
  const cargo: FittingCargoItem[] = [];
  const slotIndexByRack: Record<FittingSlotKind, number> = {
    high: 0,
    medium: 0,
    low: 0,
    rig: 0,
    subsystem: 0,
  };

  function resolveCharge(item: EftItem | undefined): number | undefined {
    if (item === undefined || !item.isCharge) return undefined;
    const chargeTypeId = resolveTypeId(item.name, typeByName);
    if (chargeTypeId === null) {
      unresolved.push({ line: item.line, text: item.name, reason: 'unknown item' });
      return undefined;
    }
    return chargeTypeId;
  }

  const items = fit.items;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.isCharge) continue; // consumed by the module ahead of it, below

    const nextIsCharge = items[i + 1]?.isCharge === true && items[i + 1].line === item.line;
    const chargeTypeId = nextIsCharge ? resolveCharge(items[i + 1]) : undefined;
    if (nextIsCharge) i++; // its charge, already handled either way

    const typeId = resolveTypeId(item.name, typeByName);
    if (typeId === null) {
      unresolved.push({ line: item.line, text: item.name, reason: 'unknown item' });
      continue;
    }

    const rack = slotByTypeId[typeId];
    const rawLine = (lines[item.line - 1] ?? '').trim().replace(/\s*\/offline\s*$/i, '');
    const hasExplicitQuantity = HAS_QUANTITY_SUFFIX.test(rawLine);

    if (rack === 'drone') {
      drones.push({ typeId, quantity: item.quantity, state: 'online' });
    } else if (rack !== undefined && !hasExplicitQuantity) {
      const slotIndex = slotIndexByRack[rack];
      if (slotIndex >= MAX_SLOTS_PER_CATEGORY) {
        unresolved.push({ line: item.line, text: item.name, reason: `too many ${rack} slots` });
        continue;
      }
      slotIndexByRack[rack] = slotIndex + 1;
      modules.push({
        slot: rack,
        slotIndex,
        typeId,
        state: 'active',
        ...(chargeTypeId === undefined ? {} : { chargeTypeId }),
      });
    } else {
      cargo.push({ typeId, quantity: item.quantity });
    }
  }

  // Deterministic order regardless of the order sections happened to appear
  // in the pasted text — the same order the List view's racks render in.
  return { hullTypeId, modules: sortFittingModules(modules), drones, cargo, unresolved };
}

/** Assembles a `Fitting` from a successful `EftLoadResult`, plus the name a Share Link can't carry. */
export function eftResultToFitting(
  result: Extract<EftLoadResult, { hullTypeId: number }>,
  name: string
): Fitting {
  return {
    name,
    shipTypeId: result.hullTypeId,
    modules: result.modules,
    drones: result.drones,
    cargo: result.cargo,
  };
}
