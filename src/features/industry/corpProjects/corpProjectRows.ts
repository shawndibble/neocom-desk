import type { BuildPlanRecord } from '@/db';
import {
  blueprintSourceOf,
  hoursLeft,
  profitAtCap,
  remainingUnits,
  type BlueprintSource,
  type CorpManufactureProject,
} from '@/engine/corpProjects/corpProjects';
import type { DetectedOwnedStockMap } from '@/engine/industry/ownedStock';
import type { BuildResult } from '@/engine/industry/types';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { TradeHub } from '@/market/hubs';
import type { BlueprintCatalog, BlueprintCatalogEntry } from '../blueprintCatalog';
import type { ActivityFacilityDefaults } from '../facilityDefaults';
import { newBuildPlan } from '../newBuildPlan';
import { ownedMaterialSourcing } from '../opportunities';

const unitsPerRun = (entry: BlueprintCatalogEntry): number =>
  entry.blueprint.products[0]?.quantity ?? 1;

export function buildableEntry(
  project: CorpManufactureProject,
  catalog: BlueprintCatalog
): BlueprintCatalogEntry | null {
  const entry = catalog.byProductTypeID.get(project.typeId);
  if (!entry || entry.blueprint.activity === 'reaction') return null;
  return remainingUnits(project) > 0 ? entry : null;
}

export function runsForUnits(units: number, entry: BlueprintCatalogEntry): number {
  return Math.max(1, Math.ceil(units / unitsPerRun(entry)));
}

export function ownedBlueprintFor(
  blueprints: readonly CharacterBlueprint[],
  blueprintTypeID: number
): CharacterBlueprint | null {
  let best: CharacterBlueprint | null = null;
  for (const candidate of blueprints) {
    if (candidate.type_id !== blueprintTypeID) continue;
    if (best === null) {
      best = candidate;
      continue;
    }
    const candidateOriginal = candidate.runs === -1;
    const bestOriginal = best.runs === -1;
    if (
      candidateOriginal !== bestOriginal
        ? candidateOriginal
        : candidate.material_efficiency > best.material_efficiency
    ) {
      best = candidate;
    }
  }
  return best;
}

export interface PlanForCorpProjectArgs {
  entry: BlueprintCatalogEntry;
  owned: CharacterBlueprint | null;
  characterId: number;
  hub: TradeHub;
  facilityDefaults: ActivityFacilityDefaults;
  assumedMe: number;
  stock: DetectedOwnedStockMap;
  units: number;
}

export function planForCorpProject(args: PlanForCorpProjectArgs): BuildPlanRecord {
  const runs = runsForUnits(args.units, args.entry);
  const needed = args.entry.blueprint.materials.map(({ typeID, quantity }) => ({
    typeID,
    quantity: quantity * runs,
  }));
  return {
    ...newBuildPlan(args.characterId, args.entry, args.owned, null, args.facilityDefaults, {
      runs,
      assumedMe: args.assumedMe,
    }),
    hubId: args.hub.id,
    materialSourcing: ownedMaterialSourcing(needed, args.stock),
  };
}

export interface ComparedPrice {
  loading: boolean;
  result: BuildResult | null;
  error: string | null;
}

export interface CorpProjectRow {
  id: string;
  characterId: number;
  characterName: string;
  project: CorpManufactureProject;
  itemName: string;
  remaining: number;
  unitCost: number | null;
  source: BlueprintSource | null;
  profit: number | null;
  hoursLeft: number | null;
  loading: boolean;
}

export function corpProjectRowId(characterId: number, projectId: string): string {
  return `${characterId}:${projectId}`;
}

export function corpProjectPlanId(characterId: number, projectId: string, units: number): string {
  return `corp-project:${corpProjectRowId(characterId, projectId)}:${units}`;
}

export function buildCorpProjectRow(args: {
  project: CorpManufactureProject;
  characterId: number;
  characterName: string;
  entry: BlueprintCatalogEntry;
  owned: CharacterBlueprint | null;
  compared: ComparedPrice;
  now: Date;
}): CorpProjectRow {
  const { project, entry, compared } = args;
  const remaining = remainingUnits(project);
  const base = {
    id: corpProjectRowId(args.characterId, project.id),
    characterId: args.characterId,
    characterName: args.characterName,
    project,
    itemName: entry.productName,
    remaining,
    hoursLeft: hoursLeft(project.expires, args.now),
  };
  const { result } = compared;
  if (compared.loading || !result) {
    return { ...base, unitCost: null, source: null, profit: null, loading: compared.loading };
  }
  const acquisition = result.materials.find(
    (m) => m.typeID === entry.blueprintTypeID && m.acquisitionTier !== undefined
  );
  const source = blueprintSourceOf({
    owned: args.owned
      ? {
          runs: args.owned.runs,
          me: args.owned.material_efficiency,
          te: args.owned.time_efficiency,
        }
      : null,
    row:
      acquisition?.acquisitionTier !== undefined
        ? {
            unitPrice: acquisition.unitPrice,
            quantity: acquisition.quantity,
            acquisitionTier: acquisition.acquisitionTier,
          }
        : undefined,
  });
  const copyPrice = source.kind === 'copy' ? source.price : 0;
  const unitCost = remaining > 0 ? (result.totalCost - copyPrice) / remaining : 0;
  return {
    ...base,
    unitCost,
    source,
    profit: profitAtCap({ rewardEach: project.rewardEach, unitCost, units: remaining, copyPrice }),
    loading: false,
  };
}
