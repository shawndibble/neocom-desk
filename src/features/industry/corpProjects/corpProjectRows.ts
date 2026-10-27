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
import type { BlueprintCatalog, BlueprintCatalogEntry } from '../blueprintCatalog';
import type { ActivityFacilityDefaults } from '../facilityDefaults';
import { newBuildPlan } from '../newBuildPlan';
import { ownedMaterialSourcing } from '../opportunities';

/** Units one run of the blueprint makes: 1 for a ship, many for ammunition. */
const unitsPerRun = (entry: BlueprintCatalogEntry): number =>
  entry.blueprint.products[0]?.quantity ?? 1;

/**
 * The catalog entry a project is built from, or null when the row would never be
 * listed: the item has no manufacturing blueprint here (or only a reaction), or
 * the Character can contribute nothing more. The hide rule and the table share it,
 * so the view is never offered only to open empty.
 */
export function buildableEntry(
  project: CorpManufactureProject,
  catalog: BlueprintCatalog
): BlueprintCatalogEntry | null {
  const entry = catalog.byProductTypeID.get(project.typeId);
  if (!entry || entry.blueprint.activity === 'reaction') return null;
  return remainingUnits(project) > 0 ? entry : null;
}

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

/**
 * The id of the unsaved plan that prices a row. Stable across renders, and it
 * carries the units so a change in what can still be contributed reprices it.
 */
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
  // A run can make more units than the Character may still contribute (100 rounds
  // for 10 paid ones); the whole run is built and paid for, so its cost is spread
  // over the units that earn the reward, not over the units it makes.
  const unitCost = remaining > 0 ? (result.totalCost - copyPrice) / remaining : 0;
  return {
    ...base,
    unitCost,
    source,
    profit: profitAtCap({ rewardEach: project.rewardEach, unitCost, units: remaining, copyPrice }),
    loading: false,
  };
}
