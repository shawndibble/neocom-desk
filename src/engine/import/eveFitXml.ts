import { MAX_SLOTS_PER_CATEGORY } from '@/engine/fittings/fittingShare';
import { resolveTypeId, type EftTypeLookup } from '@/engine/fittings/eftLoader';
import type { LoadParts, LoadWarning } from '@/engine/fittings/load';
import { squadronsOf } from '@/engine/fittings/fighters';
import {
  FITTING_SLOT_KINDS,
  type FittingCargoItem,
  type FittingDrone,
  type FittingFighter,
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

export interface FittingXmlDocument {
  entries: FittingXmlEntry[];
}

const RACK_SLOT = /^(hi|high|med|medium|low|rig|subsystem)\s+slot\s+(\d+)$/i;
const RACK_NAME: Readonly<Record<string, FittingSlotKind>> = {
  hi: 'high',
  high: 'high',
  med: 'medium',
  medium: 'medium',
  low: 'low',
  rig: 'rig',
  subsystem: 'subsystem',
};

export function loadEveFitXmlEntry(entry: FittingXmlEntry, typeByName: EftTypeLookup): LoadParts {
  const unresolved: LoadWarning[] = [];
  const hullTypeId = resolveTypeId(entry.shipTypeName, typeByName);
  if (hullTypeId === null) {
    unresolved.push({ text: entry.shipTypeName, reason: 'unknown ship', kind: 'unknown-ship' });
    return { hullTypeId: null, unresolved };
  }

  const modules: FittingModule[] = [];
  const drones: FittingDrone[] = [];
  const cargo: FittingCargoItem[] = [];
  const fighters: FittingFighter[] = [];
  const moduleBySlotKey = new Map<string, FittingModule>();

  for (const item of entry.hardware) {
    const slotKey = item.slot.trim().toLowerCase();

    if (slotKey === 'drone bay') {
      const typeId = resolveTypeId(item.type, typeByName);
      if (typeId === null) {
        unresolved.push({ text: item.type, reason: 'unknown item', kind: 'unknown-item' });
        continue;
      }
      drones.push({ typeId, quantity: item.qty ?? 1, state: 'online' });
      continue;
    }

    if (slotKey === 'fighter bay') {
      const typeId = resolveTypeId(item.type, typeByName);
      if (typeId === null) {
        unresolved.push({ text: item.type, reason: 'unknown item', kind: 'unknown-item' });
        continue;
      }
      fighters.push(...squadronsOf(typeId, item.qty ?? 1));
      continue;
    }

    if (slotKey === 'cargo' || slotKey === 'cargo hold') {
      const typeId = resolveTypeId(item.type, typeByName);
      if (typeId === null) {
        unresolved.push({ text: item.type, reason: 'unknown item', kind: 'unknown-item' });
        continue;
      }
      cargo.push({ typeId, quantity: item.qty ?? 1 });
      continue;
    }

    const rackMatch = RACK_SLOT.exec(slotKey);
    if (!rackMatch) {
      unresolved.push({
        text: item.type,
        reason: `unknown slot: ${item.slot}`,
        kind: 'unknown-slot',
      });
      continue;
    }

    const typeId = resolveTypeId(item.type, typeByName);
    if (typeId === null) {
      unresolved.push({ text: item.type, reason: 'unknown item', kind: 'unknown-item' });
      continue;
    }

    const existing = moduleBySlotKey.get(slotKey);
    if (existing) {
      existing.chargeTypeId = typeId;
      continue;
    }

    const slot = RACK_NAME[rackMatch[1].toLowerCase()];
    const slotIndex = Number(rackMatch[2]);
    if (slotIndex >= MAX_SLOTS_PER_CATEGORY) {
      unresolved.push({
        text: item.type,
        reason: `too many ${slot} slots`,
        kind: 'too-many-slots',
        rack: slot,
      });
      continue;
    }
    const module: FittingModule = { slot, slotIndex, typeId, state: 'active' };
    moduleBySlotKey.set(slotKey, module);
    modules.push(module);
  }

  modules.sort(
    (a, b) =>
      FITTING_SLOT_KINDS.indexOf(a.slot) - FITTING_SLOT_KINDS.indexOf(b.slot) ||
      a.slotIndex - b.slotIndex
  );

  return {
    hullTypeId,
    modules,
    drones,
    cargo,
    ...(fighters.length > 0 ? { fighters } : {}),
    unresolved,
  };
}
