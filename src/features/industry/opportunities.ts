/**
 * Build Opportunities (issue #642): candidate list + pricing glue over
 * existing engines. This is a seeding/sorting/costing layer, not a new
 * calculation engine — `computeBuildPlan`/`buildVsBuy` already do the actual
 * job math, `materialResolution.ts`'s owned-materials claiming already runs
 * inside it, and `src/engine/industry/opportunities.ts` already ranks and
 * classifies. What's new here is turning "every manufacturing blueprint a
 * set of characters owns" into the inputs those already-tested pieces need.
 */
import { mostRecentlyUpdatedPlan, newBuildPlan, startingLocation } from './newBuildPlan';
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
import type { MarketSnapshot, MarketSnapshotRequest } from './marketData';
import { materialPricesFor } from './priceBasis';
import { planOwnedStockSale } from '@/engine/industry/ownedStockSale';
import { profitOnBasis } from '@/engine/industry/profitBasis';
import { SKILL_IDS } from '@/engine/industry/types';
import type { ActivityFacilityDefaults } from './facilityDefaults';
import { detectOwnedStock, type DetectedOwnedStockMap } from '@/engine/industry/ownedStock';
import { takeEveryOffer } from '@/engine/industry/ownedStockOffer';
import type { OwnedStockSource } from '@/engine/industry/ownedStock';
import {
  FACILITY_PRESETS,
  resolveRigFit,
  type BuildResult,
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
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
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

/**
 * The Trade Hub a fresh Build Plan for this Character would default to —
 * `newBuildPlan`'s own `defaultsFrom?.hubId ?? DEFAULT_TRADE_HUB.id` rule,
 * reused here so a candidate's row prices at the same hub "Add to Compare"
 * would seed the plan at (issue #2055), not a hard-coded default.
 */
export function hubForCharacter(
  characterId: number,
  plansByCharacter: ReadonlyMap<number, readonly BuildPlanRecord[]>
): TradeHub {
  const plan = mostRecentlyUpdatedPlan(plansByCharacter.get(characterId));
  return (plan && getTradeHub(plan.hubId)) ?? DEFAULT_TRADE_HUB;
}

export interface OpportunityHubGroup {
  hub: TradeHub;
  candidates: OpportunityCandidate[];
}

/**
 * Candidates grouped by the Trade Hub their owning Character would price at —
 * one batched snapshot request per hub, not per row (issue #2055's "batched
 * per Character/hub" acceptance criterion), same batching shape issue #642
 * already established for one shared hub.
 */
export function groupCandidatesByHub(
  candidates: readonly OpportunityCandidate[],
  hubFor: (characterId: number) => TradeHub,
  /**
   * The build system each owning Character's rows are charged a job fee at.
   * A snapshot carries one system's cost index, so two Characters at one hub
   * who build in different systems are different groups.
   */
  buildSystemFor: (characterId: number) => number | undefined = () => undefined
): OpportunityHubGroup[] {
  const byKey = new Map<string, OpportunityHubGroup>();
  for (const candidate of candidates) {
    const hub = hubFor(candidate.characterId);
    const key = `${hub.id}|${buildSystemFor(candidate.characterId) ?? ''}`;
    const group = byKey.get(key);
    if (group) group.candidates.push(candidate);
    else byKey.set(key, { hub, candidates: [candidate] });
  }
  return [...byKey.values()];
}

/** One request, one hub, every candidate's materials+product unioned — the "bounded, batched" pricing the ticket asks for. */
export function opportunitySnapshotRequest(
  candidates: readonly OpportunityCandidate[],
  hub: TradeHub,
  catalog: BlueprintCatalog,
  pi: PiData | null,
  facilityDefaults: ActivityFacilityDefaults,
  /** The latest plan a new plan would start its build location from when none is remembered. */
  defaultsFrom?: BuildPlanRecord | null
): MarketSnapshotRequest {
  const typeIds = new Set<number>();
  for (const candidate of candidates) {
    const blueprint = toIndustryBlueprint(candidate.catalogEntry.blueprint);
    for (const id of buildPlanTypeIds(blueprint, { catalog, pi })) typeIds.add(id);
  }
  // The job fee is charged at the system the seeded plan will build in — the
  // remembered one, through the same resolution `newBuildPlan` uses — so a
  // row and the plan "Add to Compare" makes from it quote the same fee. Half
  // a pair builds at the hub, as it does on a plan.
  const location = startingLocation('manufacturing', facilityDefaults, defaultsFrom);
  return {
    hub,
    typeIds: [...typeIds],
    activity: 'manufacturing',
    ...(location.buildSystemId !== undefined && location.buildSystemName !== undefined
      ? { costIndexSystemId: location.buildSystemId }
      : {}),
  };
}

/** Owned-materials claiming for one blueprint's material list, from whole-account detected stock — same free-first rule a real Build Plan applies. */
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

/**
 * The runs an opportunity row is priced at: a BPC's own remaining runs, or 1
 * for a BPO (`runs === -1`, unlimited). Shared by the plan seeding below and
 * the per-unit metrics, so a BPO's -1 sentinel never leaks into arithmetic.
 */
export function pricedRuns(blueprint: { runs: number }): number {
  return blueprint.runs > 0 ? blueprint.runs : 1;
}

/**
 * A Build Plan for one candidate, at the given owned-materials sourcing —
 * unsaved when used to price a row (never written to Dexie), and exactly
 * what "Add to Compare" persists for a row the pilot picks: the plan's own
 * economics then match what justified picking it, rather than reverting to
 * an unclaimed-materials cost the instant it lands in Compare.
 *
 * `ownerCharacterId` is the plan's owner, separate from `candidate.characterId`
 * whose owned blueprint and materials justified the row (issue #1061: a Build
 * Plan belongs to whoever is going to build it, not to whichever alt held the
 * blueprint it was seeded from — the plan list, compare set and detail route
 * all filter to one active character, so a plan stamped with any other id is
 * unreachable). Required, not defaulted to the candidate's id: `characterId`
 * plays no part in the pricing this also seeds for, so there is no correct
 * default and a caller must say who the plan is for.
 *
 * `hub` is the Trade Hub the row was actually priced at (issue #2055:
 * `hubForCharacter`'s per-owning-Character resolution, not a hard-coded
 * default) — stamped onto the seeded plan's own `hubId` so re-pricing it as a
 * real Build Plan reads the same broker fee/sell price the row did.
 */
export function planForOpportunityCandidate(
  candidate: OpportunityCandidate,
  facilityDefaults: ActivityFacilityDefaults,
  materialSourcing: MaterialSourcingMap,
  /** Auto-picked build-vs-buy materials (issue #652) carried onto the seeded plan verbatim. */
  buildHere: readonly number[] | undefined,
  ownerCharacterId: number,
  hub: TradeHub,
  /**
   * The owner's latest plan, which a plan made on the plan page starts its
   * price basis and (when no location is remembered) build location from.
   * Rows price with it, so they use the settings the plan page does.
   */
  defaultsFrom: BuildPlanRecord | null = null
) {
  const { blueprint } = candidate;
  // A BPC prices at its own remaining runs; a BPO (runs === -1, unlimited)
  // prices at 1 — ISK/hour is a per-run rate, so this is a representative
  // rate rather than a claim about how many runs the pilot will actually
  // queue (issue #642's brief: literal per-row ISK/hour, no finite/infinite
  // run-count normalization beyond that).
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
  /** ISK value of sell orders for the product at the hub; null when the product itself is unpriced. */
  sellDepthIsk: number | null;
  /** The Trade Hub this row was priced at (issue #2055) — `hubForCharacter`'s resolution for the owning Character, reused verbatim by `planForOpportunityCandidate` so "Add to Compare" seeds a plan at the same hub. */
  hub: TradeHub;
  /** The owned-materials claim this row was priced with — reused verbatim by `planForOpportunityCandidate` so a seeded plan's cost matches what justified picking it. */
  materialSourcing: MaterialSourcingMap;
  /** Materials the auto make-or-buy depth pass (issue #652) chose to build; empty at depth 0. Reused verbatim by `planForOpportunityCandidate` for the same reason as `materialSourcing`. */
  buildHere: number[];
  /** The owner's latest plan this row took its price basis and build location from; reused by `planForOpportunityCandidate` so the plan opened from the row starts at the same settings. */
  defaultsFrom: BuildPlanRecord | null;
  /** ISK the owned stock this job uses would net if sold, charged against `result.profit` (the plan hero's sell-value basis); 0 when none is charged. */
  forgoneSale: number;
}

/**
 * What a plan opened from a row starts with: the owned blueprint that was
 * priced, the owned-materials claim and build-here picks it was priced with,
 * and its hub. Without it the plan reverts to an unclaimed-materials cost the
 * instant it opens and reads thousands of ISK/hour below the row.
 */
export type OpportunityPlanSeed = Pick<
  UnrankedOpportunityRow,
  'candidate' | 'materialSourcing' | 'buildHere' | 'hub' | 'defaultsFrom'
>;

export interface OpportunityRow extends UnrankedOpportunityRow {
  orderDepth: OrderDepthLevel;
  /** The product's latest price vs its 90-day median at `hub`, in percent (`priceVsMedianPct`); null when blank, absent while still being read. */
  vs90d?: number | null;
}

/** What produces a material, for the auto make-or-buy depth pass and for costing whatever it picks. */
export interface OpportunityAutoBuildOptions {
  recipeFor: (typeID: number) => MaterialRecipe | null;
  /** 0-3; 0 reproduces issue #642's plain behavior (nothing auto-built). */
  depth: number;
}

/**
 * The figures a Build Plan's hero shows by default, on `result`: owned
 * materials are charged at what they would sell for (instant sale into buy
 * orders), so profit reads as what building earns over just selling them. The
 * plan page does this through the same `planOwnedStockSale` and
 * `profitOnBasis`; with nothing owned, or an owned material with no price, the
 * plan's own figure stands, as it does there. Only the headline figures move:
 * cost columns keep the plan's own `totalCost`.
 */
function onPlanHeroBasis(
  result: BuildResult,
  input: {
    snapshot: MarketSnapshot;
    modifiers: CharacterModifiers;
    standing: ResolvedStandings | undefined;
    productQuantity: number;
    productUnitPrice: number | null;
  }
): { result: BuildResult; forgone: number } {
  const { snapshot, modifiers, standing } = input;
  const sale = planOwnedStockSale(
    result.materials,
    snapshot,
    'instant',
    modifiers.skills,
    standing
  );
  if (sale.ownedUnits === 0 || sale.unpriced.length > 0) return { result, forgone: 0 };
  const figures = profitOnBasis('sellValue', {
    result,
    ownedSellNet: sale.net,
    productQuantity: input.productQuantity,
    productUnitPrice: input.productUnitPrice,
    accountingLevel: modifiers.skills[SKILL_IDS.accounting] ?? 0,
    brokerRelationsLevel: modifiers.skills[SKILL_IDS.brokerRelations] ?? 0,
    factionStanding: standing?.factionStanding,
    corpStanding: standing?.corpStanding,
    brokerSurchargePct: standing?.brokerSurchargePct,
  });
  return {
    result: {
      ...result,
      profit: figures.profit,
      marginPct: figures.marginPct,
      iskPerHour: figures.iskPerHour,
      breakEvenPrice: figures.breakEvenPrice,
    },
    forgone: sale.net,
  };
}

/**
 * Prices one candidate against an already-fetched snapshot. Null only when
 * the plan cannot be built at all (an engine-level throw `computeBuildPlan`
 * already guards).
 *
 * `standing` is the owning Character's real standing toward this row's Trade
 * Hub (issue #1238's broker-fee/tax fix) — absent/`undefined` reads as zero
 * standings, same as a Build Plan's own `computeBuildPlan` call.
 *
 * Every candidate is, by construction, an owned blueprint
 * (`buildOpportunityCandidates` only ever enumerates blueprints the owning
 * Character already holds) — so the top-level product always resolves as
 * "owned, nothing to acquire" (`line: null`), regardless of the Include
 * Blueprint Cost setting (issue #2055). This is a different rule from a
 * hand-made Build Plan's own acquisition resolution, which prices the gap
 * when nothing is owned: Opportunities never has that gap at the top level.
 */
export function computeOpportunityRow(
  candidate: OpportunityCandidate,
  snapshot: MarketSnapshot,
  facilityDefaults: ActivityFacilityDefaults,
  modifiers: CharacterModifiers,
  stock: DetectedOwnedStockMap,
  autoBuild: OpportunityAutoBuildOptions,
  /** The Trade Hub this candidate's owning Character would price at (issue #2055) — `hubForCharacter`'s resolution, batched per hub by the caller. */
  hub: TradeHub,
  standing?: ResolvedStandings,
  /** The owner's latest plan: where a plan made on the plan page starts its price basis and build location. */
  defaultsFrom: BuildPlanRecord | null = null
): UnrankedOpportunityRow | null {
  const blueprint = toIndustryBlueprint(candidate.catalogEntry.blueprint);
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
  // Materials are bought at the side of the market the plan's basis names, as on the plan page.
  const materialPrices = materialPricesFor(snapshot, basePlan.materialPriceBasis);

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
    adjustedPrices,
    hubPrices: snapshot.hubPrices,
    materialPrices,
    modifiers,
    standing,
    recipeFor: autoBuild.recipeFor,
    // Owned, free — see the doc comment above.
    blueprintAcquisition: { blueprintTypeID: candidate.blueprint.type_id, line: null },
  });
  if (!result) return null;

  const productTypeID = candidate.catalogEntry.productTypeID;
  const sellPrice = productTypeID !== null ? snapshot.hubPrices[productTypeID] : undefined;
  const { result: planResult, forgone } = onPlanHeroBasis(result, {
    snapshot,
    modifiers,
    standing,
    productQuantity: (blueprint.products[0]?.quantity ?? 0) * plan.runs,
    productUnitPrice: sellPrice ?? null,
  });
  const sellVolume = productTypeID !== null ? snapshot.hubSellVolumes[productTypeID] : undefined;
  const sellDepthIsk =
    sellPrice !== undefined && sellVolume !== undefined ? sellPrice * sellVolume : null;

  return {
    candidate,
    result: planResult,
    sellDepthIsk,
    hub,
    materialSourcing,
    buildHere,
    defaultsFrom,
    forgoneSale: forgone,
  };
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

/**
 * A batch's identity for the "don't auto-recalculate above 10 blueprints"
 * cache (issue #642): which owned-blueprint entities, at which hub. What the
 * rows were priced at is `opportunitiesInputsKey`'s job.
 * Content-keyed rather than array-identity-keyed so a re-render with a fresh
 * `candidates` array reference (the panel recomputes it from Dexie/ESI data
 * on every render) does not read as "a different batch."
 *
 * No longer includes the auto make-or-buy depth (issue #652): Build
 * Opportunities' own depth control was removed as unused, and every caller
 * now computes rows at a fixed depth, so a depth component would only ever
 * hold one value.
 */
export function opportunitiesBatchKey(
  candidates: readonly OpportunityCandidate[],
  hubFor: (characterId: number) => TradeHub
): string {
  return candidates
    .map((c) => `${hubFor(c.characterId).id}:${c.id}`)
    .sort()
    .join(',');
}

/** What every row in a batch is priced at (issue #2056). */
export interface OpportunityPricingInputs {
  assumedMe: number;
  /** Each owning Character's own skills/implants (issue #2055) — absent reads as `NO_CHARACTER_MODIFIERS`. */
  modifiersByCharacter: ReadonlyMap<number, CharacterModifiers>;
  /** Each owning Character's own standing toward every Trade Hub (issue #2055) — absent reads as zero. */
  standingsByCharacter: ReadonlyMap<number, TradeHubStandingsMap>;
  facilityDefaults: ActivityFacilityDefaults;
  /**
   * Owned blueprints' ME/TE price both the candidates and any sub-build the
   * pilot owns a copy of. Owned stock is left out on purpose: assets churn
   * on every ESI refresh, which would ask for Refresh on nearly every visit.
   */
  ownedByCharacter: ReadonlyMap<number, readonly CharacterBlueprint[]>;
  /** Each owning Character's latest plan, whose price basis and build location rows start from — as a new plan does. */
  defaultsByCharacter: ReadonlyMap<number, BuildPlanRecord | null>;
}

/**
 * What a row reads off the latest plan a new plan starts from: its hub, price
 * basis and build location. Not its name, runs or timestamps, so a plan edit
 * that moves no price doesn't read as repriced. One list, for every key that
 * must notice these settings changing.
 */
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

/** JSON with object keys sorted, so equal values built in a different key order serialize the same. */
function stableSerialize(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
}

export function opportunitiesInputsKey(inputs: OpportunityPricingInputs): string {
  // Only research levels, not whole ESI records: a moved blueprint shouldn't read as repriced.
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
    modifiers,
    standings,
    // Only the manufacturing record: every candidate is a manufacturing
    // blueprint, so a Reaction Location set on some plan page changes no row.
    facilityDefaults: inputs.facilityDefaults.manufacturing,
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

/**
 * A large batch cached at other pricing inputs is neither served (stale
 * prices) nor silently recomputed (manual-refresh only, #642); it waits on
 * Refresh (#2056), which drops the entry so this sees none.
 */
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

/** Keyed by `opportunitiesBatchKey`: one entry per batch, remembering the inputs it was priced at. */
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
