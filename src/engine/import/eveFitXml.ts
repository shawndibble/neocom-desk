/**
 * Turns one `<fitting>` entry from EVE's fittings-XML export (the in-game
 * fitting window's "Export Fitting", one per doctrine fit) into a domain
 * `Fitting` — the "Load EVE XML" counterpart to `engine/fittings/eftLoader.ts`'s
 * "Load EFT". `FittingXmlDocument`/`FittingXmlEntry`/`FittingXmlHardware` are
 * the plain, engine-safe intermediate shape a DOM-touching reader (features
 * layer) produces; no `Document`/`Element` type crosses into this module,
 * matching `skillPlanXml.ts` and its `planXmlDocument.ts` reader.
 *
 * Unlike EFT text, the export states each item's exact rack and slot index
 * itself (`slot="high slot 0"`), so there is no rack-inference step — a
 * hardware element's `slot` is trusted outright. A charge shares its
 * module's slot and always follows it in the export, so a second hardware
 * hit for an already-seen rack slot is folded into that module's
 * `chargeTypeId` instead of read as a second module.
 */
import { MAX_SLOTS_PER_CATEGORY } from '@/engine/fitting/fittingShare';
import type { EftTypeLookup } from '@/engine/fittings/eftLoader';
import {
  FITTING_SLOT_KINDS,
  type Fitting,
  type FittingCargoItem,
  type FittingDrone,
  type FittingModule,
  type FittingSlotKind,
} from '@/engine/fittings/types';

export interface FittingXmlHardware {
  slot: string;
  type: string;
  qty?: number;
}

export interface FittingXmlEntry {
  name: string;
  shipTypeName: string;
  hardware: FittingXmlHardware[];
}

/** Plain, engine-safe intermediate shape — no DOM node types. */
export interface FittingXmlDocument {
  entries: FittingXmlEntry[];
}

export interface FitXmlUnresolvedItem {
  text: string;
  reason: string;
}

export type FitXmlEntryResult =
  | {
      hullTypeId: number;
      modules: FittingModule[];
      drones: FittingDrone[];
      cargo: FittingCargoItem[];
      unresolved: FitXmlUnresolvedItem[];
    }
  | { hullTypeId: null; unresolved: FitXmlUnresolvedItem[] };

const RACK_SLOT = /^(high|med|medium|low|rig|subsystem)\s+slot\s+(\d+)$/i;
const RACK_NAME: Readonly<Record<string, FittingSlotKind>> = {
  high: 'high',
  med: 'medium',
  medium: 'medium',
  low: 'low',
  rig: 'rig',
  subsystem: 'subsystem',
};

function resolveTypeId(name: string, typeByName: EftTypeLookup): number | null {
  return typeByName.get(name.toLowerCase())?.typeID ?? null;
}

/** Parses one `<fitting>` entry's hull and hardware into a `Fitting`'s parts. Never throws. */
export function loadEveFitXmlEntry(
  entry: FittingXmlEntry,
  typeByName: EftTypeLookup
): FitXmlEntryResult {
  const unresolved: FitXmlUnresolvedItem[] = [];
  const hullTypeId = resolveTypeId(entry.shipTypeName, typeByName);
  if (hullTypeId === null) {
    unresolved.push({ text: entry.shipTypeName, reason: 'unknown ship' });
    return { hullTypeId: null, unresolved };
  }

  const modules: FittingModule[] = [];
  const drones: FittingDrone[] = [];
  const cargo: FittingCargoItem[] = [];
  const moduleBySlotKey = new Map<string, FittingModule>();

  for (const item of entry.hardware) {
    const slotKey = item.slot.trim().toLowerCase();

    if (slotKey === 'drone bay') {
      const typeId = resolveTypeId(item.type, typeByName);
      if (typeId === null) {
        unresolved.push({ text: item.type, reason: 'unknown item' });
        continue;
      }
      // Carried, not deployed — matches eftLoader's drone-bay stacks.
      drones.push({ typeId, quantity: item.qty ?? 1, state: 'online' });
      continue;
    }

    if (slotKey === 'cargo hold') {
      const typeId = resolveTypeId(item.type, typeByName);
      if (typeId === null) {
        unresolved.push({ text: item.type, reason: 'unknown item' });
        continue;
      }
      cargo.push({ typeId, quantity: item.qty ?? 1 });
      continue;
    }

    const rackMatch = RACK_SLOT.exec(slotKey);
    if (!rackMatch) {
      unresolved.push({ text: item.type, reason: `unknown slot: ${item.slot}` });
      continue;
    }

    const typeId = resolveTypeId(item.type, typeByName);
    if (typeId === null) {
      unresolved.push({ text: item.type, reason: 'unknown item' });
      continue;
    }

    const existing = moduleBySlotKey.get(slotKey);
    if (existing) {
      // A second hardware hit for a rack slot already holding a module is its
      // loaded charge, not a second module — matches the export's own order.
      existing.chargeTypeId = typeId;
      continue;
    }

    const slot = RACK_NAME[rackMatch[1].toLowerCase()];
    const slotIndex = Number(rackMatch[2]);
    if (slotIndex >= MAX_SLOTS_PER_CATEGORY) {
      unresolved.push({ text: item.type, reason: `too many ${slot} slots` });
      continue;
    }
    const module: FittingModule = { slot, slotIndex, typeId, state: 'active' };
    moduleBySlotKey.set(slotKey, module);
    modules.push(module);
  }

  // Deterministic order: FITTING_SLOT_KINDS' canonical order, slot index
  // ascending within each — matches eftLoader.ts and the List view's own
  // rack order, regardless of the export's own hardware element order.
  modules.sort(
    (a, b) =>
      FITTING_SLOT_KINDS.indexOf(a.slot) - FITTING_SLOT_KINDS.indexOf(b.slot) ||
      a.slotIndex - b.slotIndex
  );

  return { hullTypeId, modules, drones, cargo, unresolved };
}

/** Assembles a `Fitting` from a successful `FitXmlEntryResult`, plus the name the export carried. */
export function fitXmlEntryResultToFitting(
  result: Extract<FitXmlEntryResult, { hullTypeId: number }>,
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
