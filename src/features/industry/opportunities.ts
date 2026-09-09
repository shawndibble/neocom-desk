/**
 * Build Opportunities (issue #642): candidate list + pricing glue over
 * existing engines. This is a seeding/sorting/costing layer, not a new
 * calculation engine — `computeBuildPlan`/`buildVsBuy` already do the actual
 * job math, `materialResolution.ts`'s owned-materials claiming already runs
 * inside it, and `src/engine/industry/opportunities.ts` already ranks and
 * classifies. What's new here is turning "every manufacturing blueprint a
 * set of characters owns" into the inputs those already-tested pieces need.
 */
import { newBuildPlan } from './newBuildPlan';
import { computeBuildPlan } from './computeBuildPlan';
import {
  toIndustryBlueprint,
  type BlueprintCatalog,
  type BlueprintCatalogEntry,
} from './blueprintCatalog';
import { buildPlanTypeIds } from './recipes';
import type { MarketSnapshot, MarketSnapshotRequest } from './marketData';
import type { FacilityDefaults } from './facilityDefaults';
import {
  detectOwnedStock,
  bulkOwnedStockSuggestions,
  type DetectedOwnedStockMap,
} from '@/engine/industry/ownedStock';
import type { OwnedStockSource } from '@/engine/industry/ownedStock';
import type { BuildResult, MaterialSourcingMap, SkillLevels } from '@/engine/industry/types';
import {
  rankOpportunities,
  type OrderDepthLevel,
  type OrderDepthThresholds,
} from '@/engine/industry/opportunities';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { TradeHub } from '@/market/hubs';
import type { PiData } from '@/sde/types';

/** One owned blueprint (original or copy) matched to what it builds — the unit of an Opportunities row. */
export interface OpportunityCandidate {
  /** `characterId:item_id` — an owned blueprint entity is unique per stack ESI hands back. */
  id: string;
  characterId: number;
  characterName: string;
  blueprint: CharacterBlueprint;
  catalogEntry: BlueprintCatalogEntry;
}

/**
 * Every owned blueprint across the given characters that can be ranked:
 * manufacturing only (reaction blueprints stay excluded, per the ticket),
 * and only ones the SDE catalog actually recognises.
 */
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
      if (!catalogEntry || catalogEntry.blueprint.activity === 'reaction') continue;
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

/** One request, one hub, every candidate's materials+product unioned — the "bounded, batched" pricing the ticket asks for. */
export function opportunitySnapshotRequest(
  candidates: readonly OpportunityCandidate[],
  hub: TradeHub,
  catalog: BlueprintCatalog,
  pi: PiData | null
): MarketSnapshotRequest {
  const typeIds = new Set<number>();
  for (const candidate of candidates) {
    const blueprint = toIndustryBlueprint(candidate.catalogEntry.blueprint);
    for (const id of buildPlanTypeIds(blueprint, { catalog, pi })) typeIds.add(id);
  }
  return { hub, typeIds: [...typeIds], activity: 'manufacturing' };
}

/** Owned-materials claiming for one blueprint's material list, from whole-account detected stock — same free-first rule a real Build Plan applies. */
function ownedMaterialSourcing(
  materials: readonly { typeID: number; quantity: number }[],
  stock: DetectedOwnedStockMap
): MaterialSourcingMap {
  const sourcing: MaterialSourcingMap = {};
  for (const suggestion of bulkOwnedStockSuggestions(materials, undefined, stock)) {
    sourcing[suggestion.typeID] = { ownedQuantity: suggestion.ownedQuantity };
  }
  return sourcing;
}

/**
 * A Build Plan for one candidate, at the given owned-materials sourcing —
 * unsaved when used to price a row (never written to Dexie), and exactly
 * what "Add to Compare" persists for a row the pilot picks: the plan's own
 * economics then match what justified picking it, rather than reverting to
 * an unclaimed-materials cost the instant it lands in Compare.
 */
export function planForOpportunityCandidate(
  candidate: OpportunityCandidate,
  facilityDefaults: FacilityDefaults,
  materialSourcing: MaterialSourcingMap
) {
  const { blueprint } = candidate;
  // A BPC prices at its own remaining runs; a BPO (runs === -1, unlimited)
  // prices at 1 — ISK/hour is a per-run rate, so this is a representative
  // rate rather than a claim about how many runs the pilot will actually
  // queue (issue #642's brief: literal per-row ISK/hour, no finite/infinite
  // run-count normalization beyond that).
  const runs = blueprint.runs > 0 ? blueprint.runs : 1;
  return {
    ...newBuildPlan(
      candidate.characterId,
      candidate.catalogEntry,
      blueprint,
      null,
      facilityDefaults,
      {
        runs,
      }
    ),
    materialSourcing,
  };
}

export interface UnrankedOpportunityRow {
  candidate: OpportunityCandidate;
  result: BuildResult;
  /** ISK value of sell orders for the product at the hub; null when the product itself is unpriced. */
  sellDepthIsk: number | null;
  /** The owned-materials claim this row was priced with — reused verbatim by `planForOpportunityCandidate` so a seeded plan's cost matches what justified picking it. */
  materialSourcing: MaterialSourcingMap;
}

export interface OpportunityRow extends UnrankedOpportunityRow {
  orderDepth: OrderDepthLevel;
}

/** Prices one candidate against an already-fetched snapshot. Null only when the plan cannot be built at all (an engine-level throw `computeBuildPlan` already guards). */
export function computeOpportunityRow(
  candidate: OpportunityCandidate,
  snapshot: MarketSnapshot,
  facilityDefaults: FacilityDefaults,
  skills: SkillLevels,
  stock: DetectedOwnedStockMap
): UnrankedOpportunityRow | null {
  const blueprint = toIndustryBlueprint(candidate.catalogEntry.blueprint);
  const materialSourcing = ownedMaterialSourcing(candidate.catalogEntry.blueprint.materials, stock);
  const plan = planForOpportunityCandidate(candidate, facilityDefaults, materialSourcing);

  const { result } = computeBuildPlan({
    plan,
    blueprint,
    systemCostIndex: snapshot.systemCostIndex ?? 0,
    adjustedPrices: snapshot.adjustedPrices ?? {},
    hubPrices: snapshot.hubPrices,
    skills,
  });
  if (!result) return null;

  const productTypeID = candidate.catalogEntry.productTypeID;
  const sellPrice = productTypeID !== null ? snapshot.hubPrices[productTypeID] : undefined;
  const sellVolume = productTypeID !== null ? snapshot.hubSellVolumes[productTypeID] : undefined;
  const sellDepthIsk =
    sellPrice !== undefined && sellVolume !== undefined ? sellPrice * sellVolume : null;

  return { candidate, result, sellDepthIsk, materialSourcing };
}

/** Sorts and classifies through the tested engine module, then re-attaches each row's own candidate/result. */
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

/** Every material typeID any candidate in the list needs owned stock detected for — the union `detectOwnedStock` scans once for the whole batch. */
export function opportunityMaterialTypeIds(
  candidates: readonly OpportunityCandidate[]
): Set<number> {
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

/**
 * A batch's identity for the "don't auto-recalculate above 10 blueprints"
 * cache (issue #642): which owned-blueprint entities, at which hub. Content-
 * keyed rather than array-identity-keyed so a re-render with a fresh
 * `candidates` array reference (the panel recomputes it from Dexie/ESI data
 * on every render) does not read as "a different batch."
 */
export function opportunitiesCacheKey(
  candidates: readonly OpportunityCandidate[],
  hub: TradeHub
): string {
  return `${hub.id}:${candidates
    .map((c) => c.id)
    .sort()
    .join(',')}`;
}

const AUTO_RECALCULATE_MAX = 10;

export function autoRecalculates(candidateCount: number): boolean {
  return candidateCount <= AUTO_RECALCULATE_MAX;
}

const rowsCache = new Map<string, OpportunityRow[]>();

export function readOpportunitiesCache(key: string): OpportunityRow[] | undefined {
  return rowsCache.get(key);
}

export function writeOpportunitiesCache(key: string, rows: OpportunityRow[]): void {
  rowsCache.set(key, rows);
}

/** Test-only: production callers rely on the manual Refresh action instead of clearing. */
export function clearOpportunitiesCache(): void {
  rowsCache.clear();
}
