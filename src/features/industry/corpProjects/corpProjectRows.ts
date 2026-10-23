/**
 * Corp project rows (issue #4786): a project, the Character's blueprint and the
 * plan that prices it, joined into what the Corp projects view shows. The plan
 * is the same one "Add to Compare" saves, resolved by `resolveBuildPlan` like
 * every other priced plan, so a row's cost and blueprint source cannot disagree
 * with the Build Plan Compare opens with.
 */
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
import type { BlueprintCatalogEntry } from '../blueprintCatalog';
import type { ActivityFacilityDefaults } from '../facilityDefaults';
import { newBuildPlan } from '../newBuildPlan';
import { ownedMaterialSourcing } from '../opportunities';

/** Units one run of the blueprint makes: 1 for a ship, many for ammunition. */
const unitsPerRun = (entry: BlueprintCatalogEntry): number =>
  entry.blueprint.products[0]?.quantity ?? 1;

/** Whole runs that make `units` of the product; at least one. */
export function runsForUnits(units: number, entry: BlueprintCatalogEntry): number {
  return Math.max(1, Math.ceil(units / unitsPerRun(entry)));
}

/**
 * The Character's own blueprint for `blueprintTypeID`: an original over a copy,
 * then the better material efficiency, so the row prices the best one they hold.
 */
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
  /** Whole-account detected stock of this blueprint's materials. */
  stock: DetectedOwnedStockMap;
  /** The units the Character can still contribute. */
  units: number;
}

/**
 * An unsaved Build Plan for the units a Character can still contribute: runs
 * to make them, priced at the hub the Character trades at, with the owned
 * materials claimed for every run. It prices the row, and Compare saves it.
 */
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

/** What `useComparedBuildResults` reports for a plan, narrowed to what a row reads. */
export interface ComparedPrice {
  loading: boolean;
  result: BuildResult | null;
  error: string | null;
}

export interface CorpProjectRow {
  /** `characterId:projectId`: a project appears once per selected Character of its corporation. */
  id: string;
  characterId: number;
  characterName: string;
  project: CorpManufactureProject;
  itemName: string;
  /** Units this Character can still contribute. */
  remaining: number;
  /** Materials and job fee of one unit; null until priced. */
  unitCost: number | null;
  source: BlueprintSource | null;
  /** Profit at the remaining cap, after the copy; null until priced. */
  profit: number | null;
  /** Whole hours to the end date; null for a project that does not end. */
  hoursLeft: number | null;
  /** Still pricing. False with a null `profit` means the plan could not be priced. */
  loading: boolean;
}

export function corpProjectRowId(characterId: number, projectId: string): string {
  return `${characterId}:${projectId}`;
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
  const runs = runsForUnits(remaining, entry);
  const unitCost = (result.totalCost - copyPrice) / (runs * unitsPerRun(entry));
  return {
    ...base,
    unitCost,
    source,
    profit: profitAtCap({ rewardEach: project.rewardEach, unitCost, units: remaining, copyPrice }),
    loading: false,
  };
}
