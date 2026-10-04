/**
 * Everything an EVE Workbench row needs from its stored EFT, from one parse
 * (issue #2542): whether it is an **Out-of-date fit** (`fitCurrency.ts`), the
 * modules its rack icons draw, the item counts its price sums, and the key
 * "Seen on zKillboard" matches it by (`workbenchSightings.ts`).
 *
 * An item the loader couldn't read is read by one rule, `unreadItemStatus`:
 * one the game still has neither makes the fit out of date nor stops it
 * matching (#2513, #2536) — the loader's catalogue leaves out Abyssal
 * filaments, LP boosters and mutated modules, which Workbench fits carry all
 * the time. One the game no longer has, or one nobody can tell (the game's
 * names unreadable), keeps the fit from matching: a dropped line could make
 * it equal a smaller group it isn't, and a missed badge is harmless where a
 * false one is not.
 *
 * What it keeps is small on purpose — rack and type per module, counts per
 * type — since a caller caches one per fit across every hull it has shown.
 */
import {
  classifyFitCurrency,
  unreadItemStatus,
  type FitCurrency,
  type GameItemLookup,
  type HullSlotCounts,
} from './fitCurrency';
import { loadEftFitting, type EftSlotLookup, type EftTypeLookup } from './eftLoader';
import { fittingItemCounts } from './fittingExport';
import type { ItemCount } from './fitSellPrice';
import type { LoadParts } from './load';
import { popularFitKey } from './popularFits';
import type { RackModule } from './types';

/** The game data a check reads: the loader's catalog, each hull's slots and the game's type names. */
export interface WorkbenchGameData {
  typeByName: EftTypeLookup;
  slotByTypeId: EftSlotLookup;
  /** `null` for a hull the Ship Tree doesn't list — its racks then aren't counted. */
  hullSlots: (shipTypeId: number) => HullSlotCounts | null;
  /** Whether a name the loader couldn't read is still a type in the game; `null`: unreadable. */
  isGameItem: GameItemLookup;
}

/** One Workbench fit, checked. */
export interface WorkbenchFitCheck {
  verdict: FitCurrency;
  /** `null` when the hull didn't load. */
  hullTypeId: number | null;
  /** The modules its EFT loaded, rack and type only (unread lines left out). */
  modules: readonly RackModule[];
  /**
   * `[typeId, quantity]` for everything that loaded — hull, modules, charges,
   * drones, fighters, cargo — tallied as the Price section tallies a Fitting.
   * Empty when the hull didn't load.
   */
  items: readonly ItemCount[];
  /** Its `popularFitKey`; `null` when any line failed to load in a way that rules matching out. */
  sightingKey: string | null;
}

/** Every line loaded, or the only ones that didn't are items the game still has. */
function loadedAsTheGameHasIt(parts: LoadParts, isGameItem: GameItemLookup): boolean {
  return parts.unresolved.every(
    (warning) =>
      warning.kind === 'unknown-item' && unreadItemStatus(warning.text, isGameItem) === 'in-game'
  );
}

/** Checks one stored EFT against today's game data. */
export function checkWorkbenchFit(eft: string, data: WorkbenchGameData): WorkbenchFitCheck {
  const parts = loadEftFitting(eft, data.typeByName, data.slotByTypeId);
  const hullTypeId = parts.hullTypeId;
  const verdict = classifyFitCurrency(
    parts,
    hullTypeId === null ? null : data.hullSlots(hullTypeId),
    data.isGameItem
  );
  if (hullTypeId === null) {
    return { verdict, hullTypeId, modules: [], items: [], sightingKey: null };
  }
  return {
    verdict,
    hullTypeId,
    modules: parts.modules.map(({ slot, typeId }) => ({ slot, typeId })),
    items: [
      ...fittingItemCounts({
        name: '',
        shipTypeId: hullTypeId,
        modules: parts.modules,
        drones: parts.drones,
        cargo: parts.cargo,
        fighters: parts.fighters,
      }),
    ],
    sightingKey: loadedAsTheGameHasIt(parts, data.isGameItem) ? popularFitKey(parts.modules) : null,
  };
}
