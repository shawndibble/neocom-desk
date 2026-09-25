/**
 * The non-EFT "Load" sources (issue #1541): an in-game DNA string or
 * `<url=fitting:…>` chat link, an eveship.fit link, and a killmail (the
 * victim's fit). All of it is pure — fetching a killmail lives with the
 * caller; here a killmail is already an ESI `victim` object.
 *
 * Every loader returns `LoadParts` (`load.ts`), the same as the EFT loader,
 * so `toLoadOutcome` and the "lines that weren't recognised" list carry over
 * unchanged. Like the EFT
 * loader, a rack comes from `FittingSlotMap`, never from position: DNA has no
 * slot information at all, and a killmail's flag says which slot but not
 * whether the item is a module or the charge loaded in it.
 */
import { MAX_SLOTS_PER_CATEGORY } from '@/engine/fitting/fittingShare';
import type { EftSlotLookup } from './eftLoader';
import type { LoadParts, LoadWarning } from './load';
import {
  FITTING_SLOT_KINDS,
  type FittingCargoItem,
  type FittingDrone,
  type FittingModule,
  type FittingSlotKind,
} from './types';

export type LoadInput =
  | { kind: 'eft'; text: string }
  | { kind: 'dna'; dna: string }
  | { kind: 'share'; code: string }
  | { kind: 'killmail'; killmailId: number; hash?: string }
  /**
   * An EVE Workbench fit page. Its API sends no CORS headers, so a browser
   * can't read the fit from it — Load says how to copy the EFT across instead.
   */
  | { kind: 'eveWorkbench' }
  | { kind: 'unknown' };

const DNA = /^\d+(?::\d+_?;\d+)+:*$/;
const DNA_IN_TEXT = /fitting:(\d+(?::\d+_?;\d+)+:*)/i;
const EFT_HEADER = /^\s*\[[^\]\n]+,[^\]\n]*\]/;
const ZKILL = /zkillboard\.com\/kill\/(\d+)/i;
const ESI_KILL = /\/killmails\/(\d+)\/([0-9a-f]{40})/i;

function classifyPlain(text: string): LoadInput {
  // eveship.fit may tag the payload with its kind (`dna:587:…`).
  const trimmed = text.trim().replace(/^dna:(?=\d)/i, '');
  if (EFT_HEADER.test(trimmed)) return { kind: 'eft', text: trimmed };
  if (DNA.test(trimmed)) return { kind: 'dna', dna: trimmed };
  const chat = DNA_IN_TEXT.exec(trimmed);
  if (chat) return { kind: 'dna', dna: chat[1] };
  return { kind: 'unknown' };
}

/** Works out which Load source a pasted string is. Never throws. */
export function classifyLoadInput(input: string): LoadInput {
  const text = input.trim();
  const esi = ESI_KILL.exec(text);
  if (esi) return { kind: 'killmail', killmailId: Number(esi[1]), hash: esi[2].toLowerCase() };
  const zkill = ZKILL.exec(text);
  if (zkill) return { kind: 'killmail', killmailId: Number(zkill[1]) };

  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      // This app's own Share Link (a Fitting's Export menu): the code rides in `?f=`.
      const code = url.searchParams.get('f');
      if (code && /\/fittings(\/edit)?\/?$/.test(url.pathname)) return { kind: 'share', code };
      if (/(^|\.)eveworkbench\.com$/i.test(url.hostname) && /^\/fit\//i.test(url.pathname)) {
        return { kind: 'eveWorkbench' };
      }
      if (/(^|\.)eveship\.fit$/i.test(url.hostname)) {
        const fit = url.searchParams.get('fit') ?? decodeURIComponent(url.hash.replace(/^#/, ''));
        return classifyPlain(fit);
      }
    } catch {
      // not a URL after all
    }
    return { kind: 'unknown' };
  }
  return classifyPlain(text);
}

function unresolved(text: string, reason: string): LoadWarning {
  return { line: 1, text, reason };
}

function sortModules(modules: FittingModule[]): void {
  modules.sort(
    (a, b) =>
      FITTING_SLOT_KINDS.indexOf(a.slot) - FITTING_SLOT_KINDS.indexOf(b.slot) ||
      a.slotIndex - b.slotIndex
  );
}

/** DNA is `hullId:typeId;qty:typeId;qty::`, with no slot information. */
export function loadDnaFitting(dna: string, slotByTypeId: EftSlotLookup): LoadParts {
  const [hull, ...entries] = dna.split(':').filter((part) => part !== '');
  const hullTypeId = Number(hull);
  if (!Number.isInteger(hullTypeId)) {
    return { hullTypeId: null, unresolved: [unresolved(dna, 'unknown ship')] };
  }

  const problems: LoadWarning[] = [];
  const modules: FittingModule[] = [];
  const drones: FittingDrone[] = [];
  const cargo: FittingCargoItem[] = [];
  const next: Record<FittingSlotKind, number> = {
    high: 0,
    medium: 0,
    low: 0,
    rig: 0,
    subsystem: 0,
  };

  for (const entry of entries) {
    const [idPart, qtyPart] = entry.split(';');
    const typeId = Number(idPart.replace(/_$/, ''));
    const quantity = Number(qtyPart);
    if (!Number.isInteger(typeId) || !Number.isInteger(quantity) || quantity < 1) {
      problems.push(unresolved(entry, 'malformed item'));
      continue;
    }
    const rack = slotByTypeId[typeId];
    if (rack === 'drone') {
      drones.push({ typeId, quantity, state: 'online' });
    } else if (rack === undefined) {
      cargo.push({ typeId, quantity });
    } else {
      // DNA folds identical modules into one `id;count` entry.
      for (let i = 0; i < quantity; i++) {
        const slotIndex = next[rack];
        if (slotIndex >= MAX_SLOTS_PER_CATEGORY) {
          problems.push(unresolved(String(typeId), `too many ${rack} slots`));
          break;
        }
        next[rack] = slotIndex + 1;
        modules.push({ slot: rack, slotIndex, typeId, state: 'active' });
      }
    }
  }
  sortModules(modules);
  return { hullTypeId, modules, drones, cargo, unresolved: problems };
}

/** The parts of ESI's killmail `victim` this reads. */
export interface KillmailVictim {
  ship_type_id: number;
  items?: {
    item_type_id: number;
    flag: number;
    quantity_destroyed?: number;
    quantity_dropped?: number;
    singleton: number;
  }[];
}

const SLOT_FLAG_BASES: readonly { rack: FittingSlotKind; base: number }[] = [
  { rack: 'low', base: 11 },
  { rack: 'medium', base: 19 },
  { rack: 'high', base: 27 },
  { rack: 'rig', base: 92 },
  { rack: 'subsystem', base: 125 },
];
const DRONE_BAY_FLAG = 87;
const CARGO_FLAG = 5;

function slotFromFlag(flag: number): { rack: FittingSlotKind; slotIndex: number } | null {
  for (const { rack, base } of SLOT_FLAG_BASES) {
    const slotIndex = flag - base;
    if (slotIndex >= 0 && slotIndex < MAX_SLOTS_PER_CATEGORY) return { rack, slotIndex };
  }
  return null;
}

function mergeCargo(items: FittingCargoItem[]): FittingCargoItem[] {
  const byType = new Map<number, number>();
  for (const { typeId, quantity } of items) {
    byType.set(typeId, (byType.get(typeId) ?? 0) + quantity);
  }
  return [...byType].map(([typeId, quantity]) => ({ typeId, quantity }));
}

/**
 * A killmail lists what was fitted (destroyed) and what survived as loot
 * (dropped) side by side; the fit is both, so the two quantities are summed.
 * Only the drone bay and cargo hold carry over besides the slots — anything
 * else (fighter bay, ore hold, …) isn't part of a Fitting.
 */
export function killmailVictimToLoadResult(
  victim: KillmailVictim,
  slotByTypeId: EftSlotLookup
): LoadParts {
  const modules: FittingModule[] = [];
  const drones: FittingDrone[] = [];
  const cargo: FittingCargoItem[] = [];
  const charges = new Map<number, number>(); // flag → charge typeId

  for (const item of victim.items ?? []) {
    const quantity = (item.quantity_destroyed ?? 0) + (item.quantity_dropped ?? 0);
    if (quantity < 1) continue;
    const slot = slotFromFlag(item.flag);
    if (slot !== null) {
      if (slotByTypeId[item.item_type_id] === slot.rack) {
        modules.push({
          slot: slot.rack,
          slotIndex: slot.slotIndex,
          typeId: item.item_type_id,
          state: 'active',
        });
      } else {
        charges.set(item.flag, item.item_type_id);
      }
    } else if (item.flag === DRONE_BAY_FLAG && slotByTypeId[item.item_type_id] === 'drone') {
      drones.push({ typeId: item.item_type_id, quantity, state: 'online' });
    } else if (item.flag === DRONE_BAY_FLAG || item.flag === CARGO_FLAG) {
      cargo.push({ typeId: item.item_type_id, quantity });
    }
  }

  for (const module of modules) {
    const base = SLOT_FLAG_BASES.find((b) => b.rack === module.slot)?.base ?? 0;
    const chargeTypeId = charges.get(base + module.slotIndex);
    if (chargeTypeId !== undefined) module.chargeTypeId = chargeTypeId;
  }
  sortModules(modules);
  return {
    hullTypeId: victim.ship_type_id,
    modules,
    drones,
    cargo: mergeCargo(cargo),
    unresolved: [],
  };
}
