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
import {
  FACILITY_PRESETS,
  resolveRigFit,
  type BuildResult,
  type MaterialSourcingMap,
  type SkillLevels,
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
  materialSourcing: MaterialSourcingMap,
  /** Auto-picked build-vs-buy materials (issue #652) carried onto the seeded plan verbatim. */
  buildHere?: readonly number[]
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
        ...(buildHere !== undefined && buildHere.length > 0 ? { buildHere: [...buildHere] } : {}),
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
  /** Materials the auto make-or-buy depth pass (issue #652) chose to build; empty at depth 0. Reused verbatim by `planForOpportunityCandidate` for the same reason as `materialSourcing`. */
  buildHere: number[];
}

export interface OpportunityRow extends UnrankedOpportunityRow {
  orderDepth: OrderDepthLevel;
}

/** What produces a material, for the auto make-or-buy depth pass and for costing whatever it picks. */
export interface OpportunityAutoBuildOptions {
  recipeFor: (typeID: number) => MaterialRecipe | null;
  /** 0-3; 0 reproduces issue #642's plain behavior (nothing auto-built). */
  depth: number;
}

/** Prices one candidate against an already-fetched snapshot. Null only when the plan cannot be built at all (an engine-level throw `computeBuildPlan` already guards). */
export function computeOpportunityRow(
  candidate: OpportunityCandidate,
  snapshot: MarketSnapshot,
  facilityDefaults: FacilityDefaults,
  skills: SkillLevels,
  stock: DetectedOwnedStockMap,
  autoBuild: OpportunityAutoBuildOptions
): UnrankedOpportunityRow | null {
  const blueprint = toIndustryBlueprint(candidate.catalogEntry.blueprint);
  const materialSourcing = ownedMaterialSourcing(candidate.catalogEntry.blueprint.materials, stock);
  const basePlan = planForOpportunityCandidate(candidate, facilityDefaults, materialSourcing);

  const systemCostIndex = snapshot.systemCostIndex ?? 0;
  const adjustedPrices = snapshot.adjustedPrices ?? {};
  const buildHere = [
    ...autoBuildHere(blueprint, basePlan.me, {
      recipeFor: autoBuild.recipeFor,
      depth: autoBuild.depth,
      // The plan's real run count, not 1 — per-job rounding means a verdict
      // decided at the wrong scale can disagree with what `computeBuildPlan`
      // actually bills once this set becomes the plan's `buildHere`.
      runs: basePlan.runs,
      ctx: {
        facility: FACILITY_PRESETS[basePlan.facility],
        rigFit: resolveRigFit(basePlan),
        security: basePlan.security,
        facilityTaxPct: basePlan.facilityTaxPct,
        systemCostIndex,
        adjustedPrices,
        materialPrices: snapshot.hubPrices,
        skills,
      },
    }),
  ];
  const plan = buildHere.length > 0 ? { ...basePlan, buildHere } : basePlan;

  const { result } = computeBuildPlan({
    plan,
    blueprint,
    systemCostIndex,
    adjustedPrices,
    hubPrices: snapshot.hubPrices,
    skills,
    recipeFor: autoBuild.recipeFor,
  });
  if (!result) return null;

  const productTypeID = candidate.catalogEntry.productTypeID;
  const sellPrice = productTypeID !== null ? snapshot.hubPrices[productTypeID] : undefined;
  const sellVolume = productTypeID !== null ? snapshot.hubSellVolumes[productTypeID] : undefined;
  const sellDepthIsk =
    sellPrice !== undefined && sellVolume !== undefined ? sellPrice * sellVolume : null;

  return { candidate, result, sellDepthIsk, materialSourcing, buildHere };
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
 * cache (issue #642): which owned-blueprint entities, at which hub, at which
 * auto make-or-buy depth (issue #652) — a depth change picks different
 * materials to build, so it must read as a different batch the same way a
 * hub change does, or a cached batch above the threshold would keep serving
 * rows priced at the depth it was first computed with. Content-keyed rather
 * than array-identity-keyed so a re-render with a fresh `candidates` array
 * reference (the panel recomputes it from Dexie/ESI data on every render)
 * does not read as "a different batch."
 */
export function opportunitiesCacheKey(
  candidates: readonly OpportunityCandidate[],
  hub: TradeHub,
  autoBuildDepth: number
): string {
  return `${hub.id}:${autoBuildDepth}:${candidates
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
