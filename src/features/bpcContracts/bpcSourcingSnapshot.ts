import { bpcOfferRows } from '@/features/bpcContracts/bpcOfferRows';
import {
  loadBlueprintLocation,
  loadContractLocationInfo,
  type ContractLocationInfo,
  type ResolvedLocation,
} from '@/features/bpcContracts/blueprintLocation';
import { loadRegionName } from '@/features/bpcContracts/regionNames';
import {
  loadPublicBpcContracts,
  type PublicBpcContractsSnapshot,
} from '@/features/bpcContracts/syncedContracts';
import type { CachedResult } from '@/esi/cache';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { loadCharacterBlueprints } from '@/features/industry/data';
import { loadBlueprints } from '@/sde/loadSde';
import type { RouteSnapshotSignal } from '@/lib/useRouteSnapshot';

export interface Snapshot {
  contractsResult: CachedResult<PublicBpcContractsSnapshot> | null;
  blueprintNames: Map<number, string>;
  /** Reaction formulas: they cannot be copied, so never "ask to copy" (GLOSSARY Community Offer). */
  reactionFormulaTypeIds: ReadonlySet<number> | null;
  regionNames: Map<number, string>;
  /** A 401/403 fetching these just resolves empty — Industry's own top-level banner (same `loadCharacterBlueprints` call) already covers re-login on every tab. */
  ownedBlueprints: CharacterBlueprint[];
  /** Keyed by `BpcContractRow.locationId`. SDE-only (issue #796) — see `loadContractLocationInfo`. */
  contractLocations: Map<number, ContractLocationInfo>;
  /** Keyed by `CharacterBlueprint.location_id`, this character's ACL. */
  ownedLocations: Map<number, ResolvedLocation>;
}

export async function loadBpcContractsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const [contractsResult, blueprintMap, ownedResult] = await Promise.all([
    loadPublicBpcContracts(),
    loadBlueprints(),
    // Same data path Industry's build-plan prefill already uses — not a
    // second ESI call for the same thing.
    loadCharacterBlueprints(characterId),
  ]);
  const blueprintNames = new Map(
    Object.entries(blueprintMap).map(([typeId, bp]) => [Number(typeId), bp.name])
  );

  const reactionFormulaTypeIds = new Set(
    Object.entries(blueprintMap)
      .filter(([, bp]) => bp.activity === 'reaction')
      .map(([typeId]) => Number(typeId))
  );

  // Already superseded: skip the region-name fan-out, its result would be discarded.
  // Originals ride along (issue #1241): the Contract BPOs source and the BPO
  // badge name their region and station too.
  const rows = contractsResult?.data ? bpcOfferRows(contractsResult.data) : [];
  const regionIds = signal.cancelled ? [] : [...new Set(rows.map((r) => r.regionId))];
  const regionEntries = await Promise.all(
    regionIds.map(async (id): Promise<[number, string] | null> => {
      const name = await loadRegionName(id);
      return name ? [id, name] : null;
    })
  );
  const regionNames = new Map(regionEntries.filter((entry) => entry !== null));

  const ownedBlueprints = ownedResult.cached?.data ?? [];

  const contractLocationIds = signal.cancelled ? [] : [...new Set(rows.map((r) => r.locationId))];
  const contractLocationEntries = await Promise.all(
    contractLocationIds.map(async (id): Promise<[number, ContractLocationInfo]> => [
      id,
      await loadContractLocationInfo(id),
    ])
  );
  const contractLocations = new Map(contractLocationEntries);

  const ownedLocationIds = signal.cancelled
    ? []
    : [...new Set(ownedBlueprints.map((bp) => bp.location_id))];
  const ownedLocationEntries = await Promise.all(
    ownedLocationIds.map(async (id): Promise<[number, ResolvedLocation]> => [
      id,
      await loadBlueprintLocation(characterId, id),
    ])
  );
  const ownedLocations = new Map(ownedLocationEntries);

  return {
    contractsResult,
    blueprintNames,
    reactionFormulaTypeIds,
    regionNames,
    ownedBlueprints,
    contractLocations,
    ownedLocations,
  };
}

/** Stable identity, so a missing snapshot doesn't invalidate memoized columns/options every render. */
export const EMPTY_MAP: ReadonlyMap<number, string> = new Map();
export const EMPTY_OWNED_BLUEPRINTS: CharacterBlueprint[] = [];
export const EMPTY_CONTRACT_LOCATIONS: ReadonlyMap<number, ContractLocationInfo> = new Map();
export const EMPTY_OWNED_LOCATIONS: ReadonlyMap<number, ResolvedLocation> = new Map();
