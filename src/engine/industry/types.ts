/**
 * Pure manufacturing-math engine types (v1: manufacturing; v2 adds reactions,
 * issue #460 — the two activities share every formula below, only their
 * facility presets and rig security multipliers differ).
 * Decoupled from src/sde — callers adapt SDE BlueprintType to IndustryBlueprint.
 *
 * Formula sources (verified 2026-08):
 * - EVE University wiki "Manufacturing": job cost formula, skill time bonuses,
 *   SCC surcharge 4%, NPC facility tax 0.25%, per-job material rounding.
 * - EVE University wiki "Upwell structures": engineering complex bonuses.
 * - EVE University wiki "Trading": sales tax / broker fee.
 * - everef.net dogma attributes: Standup M-Set rig bonuses and security
 *   multipliers (e.g. types 43920/43921/37160).
 *
 * Refinery/reaction sources (verified 2026-09, issue #460 triage comment):
 * - SDE dogma attribute dump (fuzzwork.co.uk invTypes.csv/dgmTypeAttributes.csv/
 *   dgmAttributeTypes.csv), cross-checked against the EVE University wiki
 *   "Upwell_structure" page's raw wikitext (not a rendered/summarized copy,
 *   which contradicted the dump on first pass): Athanor/Tatara reaction
 *   bonuses, and the Standup reactor rig security multipliers.
 *
 * Reaction skill sources (verified 2026-09, issue #513) — everef.net
 * ref-data dogma attributes, read on both the skills and the attributes:
 * - Industry (3380) carries only `manufacturingTimeBonus` (attribute 440,
 *   -4), type description "4% reduction in manufacturing time per skill
 *   level".
 * - Advanced Industry (3388) carries `advancedIndustrySkillIndustryJobTimeBonus`
 *   (attribute 1961, -3), type description "3% reduction in all manufacturing
 *   and research times per skill level". That attribute's own description
 *   says "all industry job times", which reads wider than the type
 *   description — the type description is the narrower and authoritative of
 *   the two, and reaction (industryActivity 11) is neither manufacturing (1)
 *   nor research.
 * - Reactions (45746) carries `reactionTimeBonus` (attribute 2660, -4),
 *   whose description is "Skill attribute that reduces time for reactions
 *   jobs". A distinct attribute exists at all only because the manufacturing
 *   ones do not reach reactions.
 * - EVE University wiki "Reactions" §Skills lists exactly Reactions (4%
 *   time/level), Mass Reactions and Advanced Mass Reactions (job slots,
 *   `reactionSlotBonus` 2661) and Remote Reactions (range) — Industry and
 *   Advanced Industry are not among them.
 */

import type { EngineAsset } from '../assetTree';
import type { MaterialRecipe } from './makeOrBuy';
import type { ResolvedMaterial } from './materialResolution';

export interface QuantityEntry {
  typeID: number;
  quantity: number;
}

/** Which industry job a blueprint/formula represents. Reactions: issue #460. */
export type IndustryActivity = 'manufacturing' | 'reaction';

/** Blueprint/reaction-formula shape the engine needs. */
export interface IndustryBlueprint {
  name: string;
  /** Base job time in seconds per run. */
  time: number;
  materials: QuantityEntry[];
  products: QuantityEntry[];
  /**
   * Which job this runs as. Optional and defaulting to 'manufacturing' so
   * every pre-#460 literal (tests, callers) keeps compiling unchanged —
   * only a reaction formula needs to say otherwise. Read it through
   * `industryActivityOf` rather than repeating the `?? 'manufacturing'`
   * fallback at each call site.
   */
  activity?: IndustryActivity;
}

/** `blueprint.activity`, defaulting to 'manufacturing' — the one place that owns what an unset activity means. */
export function industryActivityOf(blueprint: IndustryBlueprint): IndustryActivity {
  return blueprint.activity ?? 'manufacturing';
}

/**
 * Most runs one job may be installed for. `computeBuildPlan` clamps to this
 * before computing anything, so anything that *creates* a plan clamps to the
 * same number — otherwise a stored 2,000,000 displays as itself while every
 * figure on the page came from the clamp.
 */
export const MAX_JOB_RUNS = 100_000;

/**
 * Pre-issue-#609 single-tier rig model: one tier value read into both the ME
 * and TE bonus tables at once — which is what a structure with one ME rig and
 * one TE rig of the same tier actually produces, but gave no way to fit only
 * one of the two, or a mismatched tier on each. Kept only so an existing Build
 * Plan or synced record still resolves to the same bonus until it is next
 * edited — see `rigFitFromLegacyLevel` and `resolveRigFit`.
 */
export type RigLevel = 'none' | 't1' | 't2';

/**
 * One specific rig a structure can fit (issue #609): which bonus line (ME or
 * TE) and which tier. `'none'` is an empty slot.
 */
export type RigKind = 'none' | 'meT1' | 'meT2' | 'teT1' | 'teT2';

/** Every Upwell engineering complex and refinery has exactly 3 rig slots. */
export const RIG_SLOT_COUNT = 3;

/** A structure's rig fit: up to 3 independently chosen rigs (issue #609). Always normalized to exactly `RIG_SLOT_COUNT` entries — 'none' fills an unused slot. */
export type RigFit = readonly [RigKind, RigKind, RigKind];

export const EMPTY_RIG_FIT: RigFit = ['none', 'none', 'none'];

/** Every rig a pilot can pick for one slot, `'none'` first. */
export const RIG_KIND_OPTIONS: readonly RigKind[] = ['none', 'meT1', 'meT2', 'teT1', 'teT2'];

/** Pads or truncates any list of rig kinds to exactly `RIG_SLOT_COUNT` slots, filling the rest with `'none'`. */
export function normalizeRigFit(fit: readonly RigKind[] | undefined | null): RigFit {
  const slots = fit ?? [];
  return [slots[0] ?? 'none', slots[1] ?? 'none', slots[2] ?? 'none'];
}

/** A fit with one slot replaced — the one edit every rig picker (a Build Plan's own, and Settings' facility defaults) makes. */
export function setRigSlot(fit: RigFit, slot: number, kind: RigKind): RigFit {
  const next = [...fit];
  next[slot] = kind;
  return normalizeRigFit(next);
}

/** Migrates a legacy single-tier `rigLevel` into the equivalent `RigFit` — one ME rig and one TE rig of that tier, reproducing exactly the bonus every existing Build Plan already computed. */
export function rigFitFromLegacyLevel(level: RigLevel): RigFit {
  if (level === 't1') return ['meT1', 'teT1', 'none'];
  if (level === 't2') return ['meT2', 'teT2', 'none'];
  return EMPTY_RIG_FIT;
}

/**
 * The effective rig fit for a record that may still be in the pre-#609 shape:
 * `rigFit` wins when present, else `rigLevel` is migrated, else the facility
 * has no rigs fitted. Every reader of a persisted or synced Build Plan (or
 * Facility Defaults) record goes through this rather than reading either
 * field directly, so a record from before this existed and one written since
 * behave identically.
 */
export function resolveRigFit(source: {
  rigFit?: readonly RigKind[];
  rigLevel?: RigLevel;
}): RigFit {
  if (source.rigFit !== undefined) return normalizeRigFit(source.rigFit);
  if (source.rigLevel !== undefined) return rigFitFromLegacyLevel(source.rigLevel);
  return EMPTY_RIG_FIT;
}

/** Security band of the facility's solar system. Wormholes count as nullsec. */
export type SecurityBand = 'highsec' | 'lowsec' | 'nullsec';

export type FacilityKind = 'npcStation' | 'raitaru' | 'azbel' | 'sotiyo' | 'athanor' | 'tatara';

export interface FacilityPreset {
  kind: FacilityKind;
  name: string;
  /** Which job this facility hosts. A structure never hosts both (verified: refineries and engineering complexes are disjoint groups). */
  activity: IndustryActivity;
  /** Whether this is a player structure (can fit rigs, owner sets tax). */
  structure: boolean;
  /** Structure material requirement reduction, percent. */
  materialBonusPct: number;
  /** Structure job duration reduction, percent. */
  timeBonusPct: number;
  /** Structure job installation fee reduction, percent (cost-index term only). */
  jobCostBonusPct: number;
  /** Facility tax used when the caller does not supply one, percent of EIV. */
  defaultTaxPct: number;
}

/**
 * Facility presets.
 * Engineering complex bonuses: EVE University wiki "Upwell structures"
 * (Raitaru 1%/15%/3%, Azbel 1%/20%/4%, Sotiyo 1%/30%/5%).
 * NPC station: no bonuses; tax fixed at 0.25% (wiki "Manufacturing").
 * Structure default tax 0% — actual tax is owner-set, pass facilityTaxPct.
 *
 * Refinery (reaction) bonuses: issue #460 triage — Athanor 0%/0%, Tatara
 * 0%/25% (`strReactionTimeMultiplier` dogma attribute; absent entirely on
 * Athanor, 0.75 on Tatara). Neither has a job-cost bonus at all — the
 * refinery bonus table has no such column, unlike the engineering-complex
 * one — so `jobCostBonusPct` is 0, not merely unset. No NPC-station
 * equivalent exists for reactions; a refinery structure is always required.
 */
export const FACILITY_PRESETS: Record<FacilityKind, FacilityPreset> = {
  npcStation: {
    kind: 'npcStation',
    name: 'NPC station',
    activity: 'manufacturing',
    structure: false,
    materialBonusPct: 0,
    timeBonusPct: 0,
    jobCostBonusPct: 0,
    defaultTaxPct: 0.25,
  },
  raitaru: {
    kind: 'raitaru',
    name: 'Raitaru',
    activity: 'manufacturing',
    structure: true,
    materialBonusPct: 1,
    timeBonusPct: 15,
    jobCostBonusPct: 3,
    defaultTaxPct: 0,
  },
  azbel: {
    kind: 'azbel',
    name: 'Azbel',
    activity: 'manufacturing',
    structure: true,
    materialBonusPct: 1,
    timeBonusPct: 20,
    jobCostBonusPct: 4,
    defaultTaxPct: 0,
  },
  sotiyo: {
    kind: 'sotiyo',
    name: 'Sotiyo',
    activity: 'manufacturing',
    structure: true,
    materialBonusPct: 1,
    timeBonusPct: 30,
    jobCostBonusPct: 5,
    defaultTaxPct: 0,
  },
  athanor: {
    kind: 'athanor',
    name: 'Athanor',
    activity: 'reaction',
    structure: true,
    materialBonusPct: 0,
    timeBonusPct: 0,
    jobCostBonusPct: 0,
    defaultTaxPct: 0,
  },
  tatara: {
    kind: 'tatara',
    name: 'Tatara',
    activity: 'reaction',
    structure: true,
    materialBonusPct: 0,
    timeBonusPct: 25,
    jobCostBonusPct: 0,
    defaultTaxPct: 0,
  },
};

type RigBonusType = 'me' | 'te';

/**
 * Standup M-Set manufacturing rig base bonuses, percent, by specific rig
 * (issue #609 — replaces the pre-existing single-tier model, which applied
 * one tier to both bonus lines at once).
 * Source: everef.net dogma (M-Set ME I -2%, ME II -2.4%, TE I -20%, TE II -24%).
 *
 * Reused as-is for reactor rigs (Standup reactor M-Set/L-Set): issue #460
 * triage sourced identical percentages across all 3 reaction categories and
 * both rig lines. Only the security multiplier differs — see
 * `REACTION_RIG_SECURITY_MULTIPLIER` below.
 */
const RIG_KIND_BONUS: Readonly<
  Record<Exclude<RigKind, 'none'>, { type: RigBonusType; pct: number }>
> = {
  meT1: { type: 'me', pct: 2 },
  meT2: { type: 'me', pct: 2.4 },
  teT1: { type: 'te', pct: 20 },
  teT2: { type: 'te', pct: 24 },
};

/**
 * Engineering rig security multipliers applied to the base rig bonus.
 * Source: everef.net dogma "High/Low Security Bonus Multiplier",
 * "Nullsec and Wormhole Bonus Multiplier" (1 / 1.9 / 2.1).
 */
export const RIG_SECURITY_MULTIPLIER: Record<SecurityBand, number> = {
  highsec: 1,
  lowsec: 1.9,
  nullsec: 2.1,
};

/**
 * Standup reactor rig security multipliers — not shared with
 * `RIG_SECURITY_MULTIPLIER` above, which is manufacturing-only and must not
 * change (issue #460 acceptance criteria). Source: issue #460 triage —
 * dogma `lowSecModifier`/`nullSecModifier` on the Standup reactor rig
 * typeIDs: lowsec unchanged from highsec (×1), null/wormhole ×1.1.
 */
export const REACTION_RIG_SECURITY_MULTIPLIER: Record<SecurityBand, number> = {
  highsec: 1,
  lowsec: 1,
  nullsec: 1.1,
};

/** Which security-multiplier table a rig reads, by the facility's own activity. One place to own this pick, rather than the same ternary at every call site. */
export function rigSecurityMultiplierFor(activity: IndustryActivity): Record<SecurityBand, number> {
  return activity === 'reaction' ? REACTION_RIG_SECURITY_MULTIPLIER : RIG_SECURITY_MULTIPLIER;
}

/**
 * EVE's stacking penalty for same-effect modules, strongest first: a 2nd rig
 * of the same bonus type contributes ~87% of its base bonus, a 3rd ~57%.
 * Fitting two ME rigs is legal but is not twice the ME bonus (issue #609 —
 * the pre-existing single-tier model could never fit two rigs of one type at
 * all, so this case did not previously exist). Only 3 entries are ever
 * needed — `RIG_SLOT_COUNT` is the most a structure can fit.
 *
 * Source: EVE University wiki "Stacking penalties" — CCP's general module
 * formula `multiplier(i) = e^(-(i / 2.67805)^2)` for the i-th strongest
 * module (0-indexed) in a penalty group, rounded to 3 decimals: 1, 0.869,
 * 0.571 for i = 0, 1, 2.
 */
const STACKING_PENALTY_MULTIPLIERS: readonly number[] = [1, 0.869, 0.571];

function stackedRigBonusPct(fit: RigFit, bonusType: RigBonusType): number {
  const contributions = fit
    .map((kind) => (kind === 'none' ? null : RIG_KIND_BONUS[kind]))
    .filter(
      (spec): spec is { type: RigBonusType; pct: number } =>
        spec !== null && spec.type === bonusType
    )
    .map((spec) => spec.pct)
    .sort((a, b) => b - a);
  return contributions.reduce(
    (sum, pct, i) => sum + pct * (STACKING_PENALTY_MULTIPLIERS[i] ?? 0),
    0
  );
}

/**
 * Effective ME or TE rig bonus percent for a rig fit: every slot contributing
 * to `bonusType`, EVE-stacking-penalized against each other, times the
 * facility's security-band multiplier for its activity. Callers still gate
 * this at 0 for a non-structure — rigs only fit on player structures.
 */
export function rigBonusPct(
  fit: RigFit,
  bonusType: RigBonusType,
  activity: IndustryActivity,
  security: SecurityBand
): number {
  return stackedRigBonusPct(fit, bonusType) * rigSecurityMultiplierFor(activity)[security];
}

/**
 * Upwell structure typeID -> the facility preset it manufactures or reacts as.
 *
 * Engineering Complexes (group 1404) fit a Manufacturing Plant service
 * module; Refineries (group 1406) fit a Reactor service module instead —
 * verified against ESI `/universe/types/{id}` on 2026-09-05: 35825/35826/35827
 * are Raitaru/Azbel/Sotiyo, 35835/35836 are Athanor/Tatara. Citadels (group
 * 1657) can host neither and are deliberately absent, so a lookup that
 * misses is "not an industry structure".
 */
export const FACILITY_KIND_BY_STRUCTURE_TYPE_ID: Readonly<Record<number, FacilityKind>> = {
  35825: 'raitaru',
  35826: 'azbel',
  35827: 'sotiyo',
  35835: 'athanor',
  35836: 'tatara',
};

/** SCC surcharge on every industry job, percent of EIV (wiki "Manufacturing"). */
export const SCC_SURCHARGE_PCT = 4;

/** Skill typeIDs the engine reads from the trained-skills map. */
export const SKILL_IDS = {
  industry: 3380,
  advancedIndustry: 3388,
  /** Reaction job time only, never manufacturing (issue #513). */
  reactions: 45746,
  accounting: 16622,
  brokerRelations: 3446,
  /** Reprocessing: +3% refining yield a level (issue #537). */
  reprocessing: 3385,
  /** Reprocessing Efficiency: +2% a level. */
  reprocessingEfficiency: 3389,
  /** Scrapmetal Processing: +2% a level, on items rather than ore. */
  scrapmetalProcessing: 12196,
} as const;

/** Trained skill levels: skill typeID -> level (0..5). Missing = untrained. */
export type SkillLevels = Record<number, number>;

/** Where the job runs: facility preset + rig fit + system security band. */
export interface FacilityContext {
  facility: FacilityPreset;
  rigFit: RigFit;
  security: SecurityBand;
}

/**
 * Where a reaction sub-job runs, independent of the plan's own manufacturing
 * facility (issue #698's Reaction Location) — the plan's own context is never
 * a valid stand-in, since an engineering complex cannot host a reaction and a
 * refinery's rig table uses its own security multiplier
 * (`REACTION_RIG_SECURITY_MULTIPLIER`). Absent means no Reaction Location is
 * configured, which callers fall back from rather than treat as an error.
 */
export interface ReactionFacilityContext extends FacilityContext {
  facilityTaxPct?: number;
  systemCostIndex: number;
}

/** ESI adjusted prices (/markets/prices/): typeID -> adjusted_price. */
export type AdjustedPrices = Record<number, number>;

/** Trade-hub prices (lowest sell): typeID -> ISK. Missing = unpriceable. */
export type HubPrices = Record<number, number>;

/**
 * Which side of a hub's order book a Build Plan buys its materials at:
 * `'sell'` fills the lowest sell orders (pay now), `'buy'` places buy orders
 * at the highest bid (wait, pay less). Named here beside the other stored plan
 * vocabulary; the engine never branches on it — `buildVsBuy` takes the
 * resolved map and stays ignorant of which side produced it.
 */
export type MaterialPriceBasis = 'sell' | 'buy';

export interface IndustryInputs {
  blueprint: IndustryBlueprint;
  /** Number of runs in the job, >= 1. */
  runs: number;
  /** Blueprint material efficiency, 0..10. */
  me: number;
  /** Blueprint time efficiency, 0..20. */
  te: number;
  facility: FacilityPreset;
  rigFit: RigFit;
  security: SecurityBand;
  /** Facility tax, percent of EIV. Defaults to the preset's defaultTaxPct. */
  facilityTaxPct?: number;
  /** Manufacturing system cost index for the facility's system (ESI). */
  systemCostIndex: number;
  adjustedPrices: AdjustedPrices;
  hubPrices: HubPrices;
  /**
   * Prices the job's materials are bought at, when that is not the hub's
   * lowest sell. Absent = `hubPrices`. Materials only — see `buildVsBuy`.
   */
  materialPrices?: HubPrices;
  /** Per-material owned quantity / price override; absent = buy it all at the hub. */
  materialSourcing?: MaterialSourcingMap;
  skills: SkillLevels;
  /**
   * Material typeIDs the player chose to build rather than buy, at any depth
   * — not only the blueprint's own materials. Absent = build nothing, the
   * plan priced exactly as its own recipe lists it.
   */
  buildHere?: readonly number[];
  /**
   * What produces a material, for any typeID `buildHere` might name at any
   * depth. Absent alongside `buildHere` — `buildVsBuy` never has to reach the
   * blueprint catalog or pi.json itself.
   */
  recipeFor?: (typeID: number) => MaterialRecipe | null;
  /**
   * Blueprint Acquisition (issue #838) for any buildable node reached during
   * recursion — see `ResolveMaterialOptions.acquisitionFor`, which this is
   * forwarded into unchanged. Absent alongside `buildHere`/`recipeFor` —
   * every nested sub-build then keeps today's recipe-me heuristic, same as
   * `recipeFor`'s own absent case.
   */
  acquisitionFor?: (
    productTypeID: number,
    needed: number,
    ctx: FacilityContext & {
      facilityTaxPct?: number;
      systemCostIndex: number;
      adjustedPrices: AdjustedPrices;
      skills: SkillLevels;
    },
    materialPrices: HubPrices
  ) => AcquisitionResolution | null;
  /**
   * Where a reaction-produced material's own sub-build runs, when Include
   * Reactions is on for this (manufacturing-activity) plan — the Reaction
   * Location. Absent for a reaction-activity plan, which reuses this
   * `IndustryInputs`' own facility/rigFit/security for a nested reaction
   * sub-build instead (see `resolveMaterial`'s `reactionCtx` fallback).
   */
  reactionFacility?: ReactionFacilityContext;
  /**
   * Blueprint Acquisition (issue #838) for the plan's own top-level product.
   * A nested sub-build resolves its own via a `recipeFor` caller's own
   * `ResolveMaterialOptions.acquisitionFor`; the top level has no parent
   * node to resolve it from, so the feature layer computes it once and
   * passes it in here instead. Absent = no row, unchanged behavior.
   */
  blueprintAcquisition?: {
    /** The blueprint's own typeID — distinct from `blueprint.products[0]`. */
    blueprintTypeID: number;
    /** `null` only when the resolved tier is an owned BPO — nothing to acquire. */
    line: AcquisitionLine | null;
  };
}

export interface JobFeeBreakdown {
  /** Estimated item value: ME0 material quantities x adjusted prices x runs. */
  eiv: number;
  /** EIV x system cost index x structure job-cost bonus. */
  grossCost: number;
  sccSurcharge: number;
  facilityTax: number;
  total: number;
}

export interface EffectiveMaterial {
  typeID: number;
  /** ME0 quantity for the whole job (base per run x runs). */
  baseQuantity: number;
  /** Quantity actually consumed after ME/structure/rig bonuses. */
  quantity: number;
}

/**
 * Per-material sourcing overrides: how much of a material the player already
 * owns (free — never bought) and, for whatever is left, a manually entered
 * unit price for stock acquired outside the configured trade hub. Both fields
 * are independently optional; an absent entry means "0 owned, use the hub
 * price", which is the engine's original behaviour.
 */
export interface MaterialSourcing {
  /** Units already in hand. Clamped into [0, required] — never an error. */
  ownedQuantity?: number;
  /** Unit price for the non-owned remainder, replacing the hub price. */
  overridePrice?: number;
  /**
   * A pilot-forced ME/TE tier for a Blueprint Acquisition row (issue #839),
   * keyed the same way `overridePrice` already is: by the blueprint's own
   * typeID, not per buildable node — tiers never mix within one node, so one
   * override per blueprint type is enough. Bypasses `selectBlueprintTier`'s
   * cost-minimization so a pilot can deliberately use up a worse owned copy
   * first, or reseed the tier for a copy the app cannot see at all (a
   * private contract or in-person trade) — that case pairs this with
   * `overridePrice` for its cost, since nothing here priced it.
   */
  acquisitionTierOverride?: { me: number; te: number };
}

/** Sourcing overrides keyed by material typeID. Missing key = no overrides. */
export type MaterialSourcingMap = Record<number, MaterialSourcing>;

/**
 * One Character/Corporation-and-location combination that can hold owned
 * stock (issue #454). `corporationId` present (issue #798) means the
 * location is owned-stock scoped to the active Character's corporation
 * rather than a personal Character; `characterId` is still carried on a
 * corp-owned location as the Director whose access it was read through
 * (see `OwnedStockSource`'s doc comment) — never part of the location's own
 * identity, which lives in `ownedStockLocationKey`.
 */
export interface OwnedStockLocation {
  characterId: number;
  corporationId?: number;
  locationId: number;
  locationType: EngineAsset['location_type'];
}

/**
 * How a Build Plan's "use detected" owned-stock total is scoped: every
 * placement (`everywhere`, the default and today's only behavior), or only
 * placements at a plan-chosen subset of locations (`selected`). One scope
 * governs the whole plan, not per-material.
 */
export type OwnedStockScope =
  { mode: 'everywhere' } | { mode: 'selected'; locations: readonly OwnedStockLocation[] };

/** What a Blueprint Acquisition row (issue #838) reports, at whatever node resolved it. */
export interface AcquisitionLine {
  /** ISK to cover the shortfall at the resolved tier; ignored when `owned`. */
  unitPrice: number | null;
  /** True when the resolved tier's owned runs already cover the need — nothing bought. */
  owned: boolean;
}

/**
 * What a buildable node's Blueprint Acquisition resolution reports back: the
 * tier to build at, replacing the recipe's own `me`, and (unless the tier is
 * an owned BPO) a material row for the row list.
 */
export interface AcquisitionResolution {
  me: number;
  te: number;
  /** The blueprint's own typeID — distinct from what it produces. */
  blueprintTypeID: number;
  /** `null` only when the resolved tier is an owned BPO — nothing to acquire. */
  line: AcquisitionLine | null;
}

/** An effective material priced against its sourcing overrides + hub prices. */
export interface MaterialCostLine extends EffectiveMaterial {
  /** Free portion: min(sourcing.ownedQuantity, quantity). Costs nothing. */
  ownedQuantity: number;
  /** quantity - ownedQuantity: the portion that still has to be bought. */
  remainingQuantity: number;
  /** Override price if set, else the hub price; null when neither exists. */
  unitPrice: number | null;
  /** remainingQuantity x unitPrice; 0 when fully owned or unpriced. */
  lineCost: number;
  /** True when a non-zero remainder has neither an override nor a hub price. */
  unpriced: boolean;
}

export type BuildRecommendation = 'build' | 'buy' | 'unknown';

export interface BuildResult {
  /**
   * One line per blueprint material. A material in `buildHere` carries a
   * `subBuild` (see `ResolvedMaterial`) instead of a plain hub price — its
   * `lineCost` is then the rolled-up cost of the job that produces it,
   * recursively, rather than a market price.
   */
  materials: ResolvedMaterial[];
  /** Job duration in seconds. */
  seconds: number;
  jobFee: JobFeeBreakdown;
  /**
   * Sum of the material line costs: owned units are free, a built material's
   * line is its rolled-up build cost (materials + every sub-job's fee, all
   * the way down), and a material neither owned, priced, nor built is
   * excluded and flagged in `unpricedMaterials` instead of costed as free.
   */
  materialCost: number;
  /** materialCost + jobFee.total. Sub-job fees are already inside materialCost, via each built material's rolled-up cost — jobFee here is only this job's own. */
  totalCost: number;
  /** Cost of buying the product outright at the hub; null if unpriced. */
  buyCost: number | null;
  /** Gross sell value of the products; null if the product is unpriced. */
  revenue: number | null;
  salesTax: number | null;
  brokerFee: number | null;
  /** revenue - salesTax - brokerFee; null when unpriceable. */
  netRevenue: number | null;
  /** revenue - salesTax - brokerFee - totalCost; null when unpriceable. */
  profit: number | null;
  /** profit / revenue x 100; null when unpriceable. */
  marginPct: number | null;
  iskPerHour: number | null;
  /** revenue - totalCost (no selling fees); null when unpriceable. */
  grossProfit: number | null;
  /** grossProfit / revenue x 100; null when unpriceable. */
  grossMargin: number | null;
  grossIskPerHour: number | null;
  /**
   * Net sell price per unit at which the job breaks even (profit = 0), after
   * sales tax and broker fee. Independent of the product's hub price — only
   * needs totalCost and quantity, so it's available even when unpriceable.
   * Null only when the blueprint has no product (quantity <= 0).
   */
  breakEvenPrice: number | null;
  /**
   * Material typeIDs whose non-owned remainder has no override and no hub
   * price — the actual blocking leaves, at whatever depth they sit, never a
   * built material's own typeID standing in for a descendant.
   */
  unpricedMaterials: number[];
  /** True when any material remainder is unpriced, or the product lacks a hub price. */
  unpriceable: boolean;
  recommendation: BuildRecommendation;
}
