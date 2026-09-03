/**
 * The impure half of Build Plan owned-material detection (issue #181): fetch
 * every authenticated Character's assets, then resolve the location names the
 * breakdown shows. `src/engine/industry/ownedStock.ts` does the counting.
 *
 * Detection never writes. What it produces is a suggestion the player either
 * clicks or ignores; the plan's stored `ownedQuantity` stays the single source
 * of truth, so nothing here can change a saved plan's cost.
 */

import type {
  DetectedOwnedStock,
  OwnedStockPlacement,
  OwnedStockSource,
} from '@/engine/industry/ownedStock';
import { loadAllCharactersAssets } from '@/features/character/assets';
import { loadStationName } from '@/features/character/stations';
import { loadStructureName } from '@/features/character/structures';
import { loadSystemName } from '@/features/character/systemSecurity';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';

export interface OwnedStockSnapshot {
  /** Engine input: one entry per Character whose assets could be read. */
  sources: OwnedStockSource[];
  characterNames: Map<number, string>;
  /**
   * Characters whose asset list was capped, missing pages, or unreadable.
   * Non-empty means every detected total is a floor, not an exact count -
   * under-reporting owned stock silently inflates a plan's buy list, so it
   * must never be presented as exact.
   */
  incompleteCharacters: string[];
}

export const EMPTY_OWNED_STOCK_SNAPSHOT: OwnedStockSnapshot = {
  sources: [],
  characterNames: new Map(),
  incompleteCharacters: [],
};

/** Cache-first per `loadCharacterAssets`: the common case costs no ESI call at all. */
export async function loadOwnedStockSnapshot(): Promise<OwnedStockSnapshot> {
  const { entries, skipped } = await loadAllCharactersAssets();
  const characterNames = new Map<number, string>();
  const sources: OwnedStockSource[] = entries.map((entry) => {
    characterNames.set(entry.characterId, entry.name);
    return { characterId: entry.characterId, assets: entry.assets };
  });
  const incompleteCharacters = [
    ...entries.filter((entry) => entry.truncated).map((entry) => entry.name),
    ...skipped.map((character) => character.name),
  ].sort((a, b) => a.localeCompare(b));
  return { sources, characterNames, incompleteCharacters };
}

/** A name lookup that fails is a missing label, not a failed detection. */
async function safeName(load: () => Promise<string | null>): Promise<string | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

/**
 * Display names for the locations behind a detection, mirroring the Assets
 * page's own resolution: stations and systems are public, structures are
 * ACL-checked per Character and so must be looked up under the Character whose
 * stock actually sits there. An `item`-typed placement is a parent ESI never
 * returned an asset row for - usually a personal-hangar division inside a
 * player-owned structure, which the structures endpoint still resolves.
 *
 * Only the locations a detection actually surfaced are resolved, not every
 * location in the asset lists.
 */
export async function resolveStockLocationNames(
  placements: readonly OwnedStockPlacement[]
): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  const stationIds = new Set<number>();
  const systemIds = new Set<number>();
  const structureIdsByCharacter = new Map<number, Set<number>>();

  for (const placement of placements) {
    if (placement.locationType === 'station') {
      stationIds.add(placement.locationId);
    } else if (placement.locationType === 'solar_system') {
      systemIds.add(placement.locationId);
    } else {
      let ids = structureIdsByCharacter.get(placement.characterId);
      if (!ids) {
        ids = new Set();
        structureIdsByCharacter.set(placement.characterId, ids);
      }
      ids.add(placement.locationId);
    }
  }

  const record = (id: number, name: string | null) => {
    if (name) names.set(id, name);
  };

  await Promise.all([
    ...[...stationIds].map(async (id) => record(id, await safeName(() => loadStationName(id)))),
    ...[...systemIds].map(async (id) => record(id, await safeName(() => loadSystemName(id)))),
    mapWithConcurrencyLimit(
      [...structureIdsByCharacter],
      ESI_FANOUT_CONCURRENCY,
      async ([characterId, ids]) => {
        await Promise.all(
          [...ids].map(async (id) =>
            record(id, await safeName(() => loadStructureName(characterId, id)))
          )
        );
      }
    ),
  ]);

  return names;
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/**
 * One placement's location label. Falls back to the same id-based labels the
 * Assets page uses - a structure name is ACL-checked and can fail to resolve
 * even for a Character with assets sitting in it.
 */
export function stockLocationLabel(
  placement: OwnedStockPlacement,
  names: ReadonlyMap<number, string>,
  t: Translate
): string {
  const name = names.get(placement.locationId);
  if (placement.locationType === 'station') {
    return name ?? t('assets.stationLabel', { id: placement.locationId });
  }
  if (placement.locationType === 'solar_system') {
    return name
      ? t('assets.inSpaceNamedLabel', { name })
      : t('assets.inSpaceLabel', { id: placement.locationId });
  }
  return name ?? t('assets.structureLabel', { id: placement.locationId });
}

/** Everything `MaterialsTable` needs to render detection, bundled so the table takes one optional prop. */
export interface OwnedStockDetection {
  stockFor: (typeID: number) => DetectedOwnedStock | undefined;
  /** True when any Character's list was incomplete: every total renders as a lower bound. */
  lowerBound: boolean;
  incompleteCharacters: readonly string[];
  characterNameFor: (characterId: number) => string;
  locationLabelFor: (placement: OwnedStockPlacement) => string;
}
