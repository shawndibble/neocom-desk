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
  reactionFormulaTypeIds: ReadonlySet<number> | null;
  regionNames: Map<number, string>;
  ownedBlueprints: CharacterBlueprint[];
  contractLocations: Map<number, ContractLocationInfo>;
  ownedLocations: Map<number, ResolvedLocation>;
}

export async function loadBpcContractsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const [contractsResult, blueprintMap, ownedResult] = await Promise.all([
    loadPublicBpcContracts(),
    loadBlueprints(),
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

export const EMPTY_MAP: ReadonlyMap<number, string> = new Map();
export const EMPTY_OWNED_BLUEPRINTS: CharacterBlueprint[] = [];
export const EMPTY_CONTRACT_LOCATIONS: ReadonlyMap<number, ContractLocationInfo> = new Map();
export const EMPTY_OWNED_LOCATIONS: ReadonlyMap<number, ResolvedLocation> = new Map();
