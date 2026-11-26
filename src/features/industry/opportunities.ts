import {
  mostRecentlyUpdatedPlan,
  newBuildPlan,
  newPlanHub,
  startingLocation,
} from './newBuildPlan';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import { computeBuildPlan } from './computeBuildPlan';
import type { BuildPlanRecord } from '@/db';
import type { ResolvedStandings } from '@/engine/market/standings';
import type { TradeHubStandingsMap } from '@/features/market/useTradeHubStandings';
import {
  toIndustryBlueprint,
  type BlueprintCatalog,
  type BlueprintCatalogEntry,
} from './blueprintCatalog';
import { buildPlanTypeIds } from './recipes';
import { capProductPrice } from './productPriceCap';
import type { MarketSnapshot, MarketSnapshotRequest } from './marketData';
import { buyOrderFeePct } from '@/engine/industry/buyOrderPrices';
import { materialPricesFor } from './priceBasis';
import { planVerdictOf } from './planPricing';
import type { ProfitBasis } from '@/engine/industry/profitBasis';
import { planReactionLocation } from './planReactionLocation';
import type { ReactionLocationState } from '@/engine/industry/reactionLocation';
import type { ActivityFacilityDefaults } from './facilityDefaults';
import { detectOwnedStock, type DetectedOwnedStockMap } from '@/engine/industry/ownedStock';
import { takeEveryOffer } from '@/engine/industry/ownedStockOffer';
import type { OwnedStockSource } from '@/engine/industry/ownedStock';
import {
  FACILITY_PRESETS,
  resolveRigFit,
  type BuildResult,
  type IndustryActivity,
  type MaterialSourcingMap,
} from '@/engine/industry/types';
import { autoBuildHere } from '@/engine/industry/autoMakeOrBuy';
import type { MaterialRecipe } from '@/engine/industry/makeOrBuy';
import {
  rankOpportunities,
  type OrderDepthLevel,
  type OrderDepthThresholds,
} from '@/engine/industry/opportunities';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { TradeHub } from '@/market/hubs';
import type { PiData } from '@/sde/types';

export interface OpportunityCandidate {
  id: string;
  characterId: number;
  characterName: string;
  blueprint: CharacterBlueprint;
  catalogEntry: BlueprintCatalogEntry;
}

export function isReaction(candidate: Pick<OpportunityCandidate, 'catalogEntry'>): boolean {
  return candidate.catalogEntry.blueprint.activity === 'reaction';
}

export function buildOpportunityCandidates(
  ownedByCharacter: ReadonlyMap<number, readonly CharacterBlueprint[]>,
  characterNames: ReadonlyMap<number, string>,
  catalog: BlueprintCatalog
): OpportunityCandidate[] {
  const candidates: OpportunityCandidate[] = [];
  for (const [characterId, blueprints] of ownedByCharacter) {
    const characterName = characterNames.get(characterId) ?? '';
    for (const blueprint of blueprints) {
      const catalogEntry = catalog.byBlueprintTypeID.get(blueprint.type_id);
      if (!catalogEntry) continue;
      candidates.push({
        id: `${characterId}:${blueprint.item_id}`,
        characterId,
        characterName,
        blueprint,
        catalogEntry,
      });
    }
  }
  return candidates;
}

export function hubForCharacter(
  characterId: number,
  plansByCharacter: ReadonlyMap<number, readonly BuildPlanRecord[]>
): TradeHub {
  const plan = mostRecentlyUpdatedPlan(plansByCharacter.get(characterId));
  return newPlanHub(plan);
}

export interface OpportunityHubGroup {
  hub: TradeHub;
  activity: IndustryActivity;
  candidates: OpportunityCandidate[];
}

export function groupCandidatesByHub(
  candidates: readonly OpportunityCandidate[],
  hubFor: (characterId: number) => TradeHub,
  buildSystemFor: (characterId: number, activity: IndustryActivity) => number | undefined = () =>
    undefined
): OpportunityHubGroup[] {
  const byKey = new Map<string, OpportunityHubGroup>();
  for (const candidate of candidates) {
    const hub = hubFor(candidate.characterId);
    const activity = candidate.catalogEntry.blueprint.activity;
    const key = `${hub.id}|${activity}|${buildSystemFor(candidate.characterId, activity) ?? ''}`;
    const group = byKey.get(key);
    if (group) group.candidates.push(candidate);
    else byKey.set(key, { hub, activity, candidates: [candidate] });
  }
  return [...byKey.values()];
}

export function opportunitySnapshotRequest(
  candidates: readonly OpportunityCandidate[],
  hub: TradeHub,
  catalog: BlueprintCatalog,
  pi: PiData | null,
  facilityDefaults: ActivityFacilityDefaults,
  defaultsFrom?: BuildPlanRecord | null,
  activity: IndustryActivity = 'manufacturing'
): MarketSnapshotRequest {
  const typeIds = new Set<number>();
  for (const candidate of candidates) {
    const blueprint = toIndustryBlueprint(candidate.catalogEntry.blueprint);
    for (const id of buildPlanTypeIds(blueprint, { catalog, pi })) typeIds.add(id);
  }
  const location = startingLocation(activity, facilityDefaults, defaultsFrom);
  return {
    hub,
    typeIds: [...typeIds],
    activity,
    ...(location.buildSystemId !== undefined && location.buildSystemName !== undefined
      ? { costIndexSystemId: location.buildSystemId }
      : {}),
  };
}

export function ownedMaterialSourcing(
  materials: readonly { typeID: number; quantity: number }[],
  stock: DetectedOwnedStockMap
): MaterialSourcingMap {
  const sourcing: MaterialSourcingMap = {};
  for (const { typeID, to } of takeEveryOffer(
    materials,
    () => undefined,
    (typeID) => stock.get(typeID)?.quantity ?? 0
  )) {
    sourcing[typeID] = { ownedQuantity: to };
  }
  return sourcing;
}

export function pricedRuns(blueprint: { runs: number }): number {
  return blueprint.runs > 0 ? blueprint.runs : 1;
}

export function planForOpportunityCandidate(
  candidate: OpportunityCandidate,
  facilityDefaults: ActivityFacilityDefaults,
  materialSourcing: MaterialSourcingMap,
  buildHere: readonly number[] | undefined,
  ownerCharacterId: number,
  hub: TradeHub,
  defaultsFrom: BuildPlanRecord | null = null
) {
  const { blueprint } = candidate;
  const runs = pricedRuns(blueprint);
  return {
    ...newBuildPlan(
      ownerCharacterId,
      candidate.catalogEntry,
      blueprint,
      defaultsFrom,
      facilityDefaults,
      {
        runs,
        ...(buildHere !== undefined && buildHere.length > 0 ? { buildHere: [...buildHere] } : {}),
      }
    ),
    hubId: hub.id,
    materialSourcing,
  };
}

export interface UnrankedOpportunityRow {
  candidate: OpportunityCandidate;
  result: BuildResult;
  sellDepthIsk: number | null;
  hub: TradeHub;
  materialSourcing: MaterialSourcingMap;
  buildHere: number[];
  defaultsFrom: BuildPlanRecord | null;
  forgoneSale: number;
  priceCapped: boolean;
  reactionLocation?: Exclude<ReactionLocationState, 'ok'>;
}

export type OpportunityPlanSeed = Pick<
  UnrankedOpportunityRow,
  'candidate' | 'materialSourcing' | 'buildHere' | 'hub' | 'defaultsFrom'
>;

export interface OpportunityRow extends UnrankedOpportunityRow {
  orderDepth: OrderDepthLevel;
  vs90d?: number | null;
}

export interface OpportunityAutoBuildOptions {
  recipeFor: (typeID: number) => MaterialRecipe | null;
  depth: number;
}

export function computeOpportunityRow(
  candidate: OpportunityCandidate,
  rawSnapshot: MarketSnapshot,
  facilityDefaults: ActivityFacilityDefaults,
  modifiers: CharacterModifiers,
  stock: DetectedOwnedStockMap,
  autoBuild: OpportunityAutoBuildOptions,
  hub: TradeHub,
  standing: ResolvedStandings | undefined,
  defaultsFrom: BuildPlanRecord | null,
  profitBasis: ProfitBasis
): UnrankedOpportunityRow | null {
  const blueprint = toIndustryBlueprint(candidate.catalogEntry.blueprint);
  const { snapshot, capped: priceCapped } = capProductPrice(
    rawSnapshot,
    candidate.catalogEntry.productTypeID
  );
  const materialSourcing = ownedMaterialSourcing(candidate.catalogEntry.blueprint.materials, stock);
  const basePlan = planForOpportunityCandidate(
    candidate,
    facilityDefaults,
    materialSourcing,
    undefined,
    candidate.characterId,
    hub,
    defaultsFrom
  );
  const materialPrices = materialPricesFor(
    snapshot,
    basePlan.materialPriceBasis,
    buyOrderFeePct(modifiers.skills, standing)
  );

  const systemCostIndex = snapshot.systemCostIndex ?? 0;
  const adjustedPrices = snapshot.adjustedPrices ?? {};
  const buildHere = [
    ...autoBuildHere(blueprint, basePlan.me, {
      recipeFor: autoBuild.recipeFor,
      depth: autoBuild.depth,
      runs: basePlan.runs,
      ctx: {
        facility: FACILITY_PRESETS[basePlan.facility],
        rigFit: resolveRigFit(basePlan),
        security: basePlan.security,
        facilityTaxPct: basePlan.facilityTaxPct,
        systemCostIndex,
        regionalTaxPct: snapshot.regionalTaxPct,
        adjustedPrices,
        materialPrices,
        modifiers,
      },
    }),
  ];
  const plan = buildHere.length > 0 ? { ...basePlan, buildHere } : basePlan;

  const { result } = computeBuildPlan({
    plan,
    blueprint,
    systemCostIndex,
    regionalTaxPct: snapshot.regionalTaxPct,
    adjustedPrices,
    hubPrices: snapshot.hubPrices,
    materialPrices,
    modifiers,
    standing,
    recipeFor: autoBuild.recipeFor,
    blueprintAcquisition: { blueprintTypeID: candidate.blueprint.type_id, line: null },
  });
  if (!result) return null;

  const productTypeID = candidate.catalogEntry.productTypeID;
  const verdict = planVerdictOf(
    { result },
    {
      snapshot,
      productTypeID,
      productQuantity: (blueprint.products[0]?.quantity ?? 0) * plan.runs,
      profitBasis,
      modifiers,
      standing,
    }
  );
  const planResult = verdict.basisResult ?? result;
  const { forgone, productUnitPrice: sellPrice } = verdict;
  const sellVolume = productTypeID !== null ? snapshot.hubSellVolumes[productTypeID] : undefined;
  const sellDepthIsk =
    sellPrice !== null && sellVolume !== undefined ? sellPrice * sellVolume : null;

  const reactionState = isReaction(candidate)
    ? planReactionLocation(plan, 'reaction')?.state
    : undefined;
  const reactionLocation = reactionState && reactionState !== 'ok' ? reactionState : undefined;

  return {
    candidate,
    result: reactionLocation
      ? { ...planResult, profit: null, marginPct: null, iskPerHour: null }
      : planResult,
    ...(reactionLocation ? { reactionLocation } : {}),
    sellDepthIsk,
    hub,
    materialSourcing,
    buildHere,
    defaultsFrom,
    forgoneSale: forgone,
    priceCapped,
  };
}

export function rankOpportunityRows(
  rows: readonly UnrankedOpportunityRow[],
  thresholds?: OrderDepthThresholds
): OpportunityRow[] {
  const ranked = rankOpportunities(
    rows.map((row) => ({
      id: row.candidate.id,
      iskPerHour: row.result.iskPerHour,
      buildCost: row.result.totalCost,
      sellDepthIsk: row.sellDepthIsk,
    })),
    thresholds
  );
  const byId = new Map(rows.map((row) => [row.candidate.id, row]));
  return ranked.map((r) => ({ ...byId.get(r.id)!, orderDepth: r.orderDepth }));
}

function opportunityMaterialTypeIds(candidates: readonly OpportunityCandidate[]): Set<number> {
  const ids = new Set<number>();
  for (const candidate of candidates) {
    for (const material of candidate.catalogEntry.blueprint.materials) ids.add(material.typeID);
  }
  return ids;
}

export function detectOpportunityStock(
  sources: readonly OwnedStockSource[],
  candidates: readonly OpportunityCandidate[]
): DetectedOwnedStockMap {
  return detectOwnedStock(sources, opportunityMaterialTypeIds(candidates));
}

export function opportunitiesBatchKey(
  candidates: readonly OpportunityCandidate[],
  hubFor: (characterId: number) => TradeHub
): string {
  return candidates
    .map((c) => `${hubFor(c.characterId).id}:${c.id}`)
    .sort()
    .join(',');
}

export interface OpportunityPricingInputs {
  assumedMe: number;
  modifiersByCharacter: ReadonlyMap<number, CharacterModifiers>;
  standingsByCharacter: ReadonlyMap<number, TradeHubStandingsMap>;
  facilityDefaults: ActivityFacilityDefaults;
  ownedByCharacter: ReadonlyMap<number, readonly CharacterBlueprint[]>;
  defaultsByCharacter: ReadonlyMap<number, BuildPlanRecord | null>;
  profitBasis: ProfitBasis;
  pricesReactions?: boolean;
}

export function planSettings(plan: BuildPlanRecord | null) {
  return (
    plan && {
      hubId: plan.hubId,
      materialPriceBasis: plan.materialPriceBasis ?? null,
      facility: plan.facility,
      rigFit: plan.rigFit ?? null,
      facilityTaxPct: plan.facilityTaxPct ?? null,
      security: plan.security,
      buildSystemId: plan.buildSystemId ?? null,
    }
  );
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
}

export function opportunitiesInputsKey(inputs: OpportunityPricingInputs): string {
  const research = [...inputs.ownedByCharacter.values()]
    .flat()
    .map((bp) => `${bp.item_id}:${bp.material_efficiency}:${bp.time_efficiency}`)
    .sort();
  const modifiers = [...inputs.modifiersByCharacter.entries()].sort(([a], [b]) => a - b);
  const standings = [...inputs.standingsByCharacter.entries()]
    .sort(([a], [b]) => a - b)
    .map(
      ([characterId, byHub]) =>
        [characterId, [...byHub.entries()].sort(([a], [b]) => a.localeCompare(b))] as const
    );
  const defaults = [...inputs.defaultsByCharacter.entries()]
    .sort(([a], [b]) => a - b)
    .map(([characterId, plan]) => [characterId, planSettings(plan)]);
  return stableSerialize({
    assumedMe: inputs.assumedMe,
    profitBasis: inputs.profitBasis,
    modifiers,
    standings,
    facilityDefaults: inputs.pricesReactions
      ? inputs.facilityDefaults
      : inputs.facilityDefaults.manufacturing,
    defaults,
    research,
  });
}

export const AUTO_RECALCULATE_MAX = 10;

export function autoRecalculates(candidateCount: number): boolean {
  return candidateCount <= AUTO_RECALCULATE_MAX;
}

export interface OpportunitiesCacheEntry {
  inputsKey: string;
  rows: OpportunityRow[];
}

export type OpportunitiesCacheDecision =
  { kind: 'serve'; rows: OpportunityRow[] } | { kind: 'needs-refresh' } | { kind: 'compute' };

export function decideOpportunitiesCache(
  entry: OpportunitiesCacheEntry | undefined,
  inputsKey: string,
  manualRefreshOnly: boolean
): OpportunitiesCacheDecision {
  if (!manualRefreshOnly || !entry) return { kind: 'compute' };
  return entry.inputsKey === inputsKey
    ? { kind: 'serve', rows: entry.rows }
    : { kind: 'needs-refresh' };
}

const rowsCache = new Map<string, OpportunitiesCacheEntry>();

export function readOpportunitiesCache(batchKey: string): OpportunitiesCacheEntry | undefined {
  return rowsCache.get(batchKey);
}

export function writeOpportunitiesCache(batchKey: string, entry: OpportunitiesCacheEntry): void {
  rowsCache.set(batchKey, entry);
}

export function deleteOpportunitiesCache(batchKey: string): void {
  rowsCache.delete(batchKey);
}
