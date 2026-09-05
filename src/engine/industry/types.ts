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
 */

import type { EngineAsset } from '../assetTree';

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
   * only a reaction formula needs to say otherwise.
   */
  activity?: IndustryActivity;
}

export type RigLevel = 'none' | 't1' | 't2';

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

/**
 * Standup M-Set manufacturing rig base bonuses, percent.
 * Source: everef.net dogma (M-Set ME I -2%, ME II -2.4%, TE I -20%, TE II -24%).
 *
 * Reused as-is for reactor rigs (Standup reactor M-Set/L-Set): issue #460
 * triage sourced identical percentages across all 3 reaction categories and
 * both rig lines. Only the security multiplier differs — see
 * `REACTION_RIG_SECURITY_MULTIPLIER` below.
 */
export const RIG_MATERIAL_BONUS_PCT: Record<RigLevel, number> = { none: 0, t1: 2, t2: 2.4 };
export const RIG_TIME_BONUS_PCT: Record<RigLevel, number> = { none: 0, t1: 20, t2: 24 };

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
  accounting: 16622,
  brokerRelations: 3446,
} as const;

/** Trained skill levels: skill typeID -> level (0..5). Missing = untrained. */
export type SkillLevels = Record<number, number>;

/** Where the job runs: facility preset + rig fit + system security band. */
export interface FacilityContext {
  facility: FacilityPreset;
  rig: RigLevel;
  security: SecurityBand;
}

/** ESI adjusted prices (/markets/prices/): typeID -> adjusted_price. */
export type AdjustedPrices = Record<number, number>;

/** Trade-hub prices (lowest sell): typeID -> ISK. Missing = unpriceable. */
export type HubPrices = Record<number, number>;

export interface IndustryInputs {
  blueprint: IndustryBlueprint;
  /** Number of runs in the job, >= 1. */
  runs: number;
  /** Blueprint material efficiency, 0..10. */
  me: number;
  /** Blueprint time efficiency, 0..20. */
  te: number;
  facility: FacilityPreset;
  rig: RigLevel;
  security: SecurityBand;
  /** Facility tax, percent of EIV. Defaults to the preset's defaultTaxPct. */
  facilityTaxPct?: number;
  /** Manufacturing system cost index for the facility's system (ESI). */
  systemCostIndex: number;
  adjustedPrices: AdjustedPrices;
  hubPrices: HubPrices;
  /** Per-material owned quantity / price override; absent = buy it all at the hub. */
  materialSourcing?: MaterialSourcingMap;
  skills: SkillLevels;
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
}

/** Sourcing overrides keyed by material typeID. Missing key = no overrides. */
export type MaterialSourcingMap = Record<number, MaterialSourcing>;

/** One Character-and-location combination that can hold owned stock (issue #454). */
export interface OwnedStockLocation {
  characterId: number;
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
  materials: MaterialCostLine[];
  /** Job duration in seconds. */
  seconds: number;
  jobFee: JobFeeBreakdown;
  /** Sum of the material line costs: owned units are free, unpriced ones excluded and flagged. */
  materialCost: number;
  /** materialCost + jobFee.total. */
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
  /** Material typeIDs whose non-owned remainder has no override and no hub price. */
  unpricedMaterials: number[];
  /** True when any material remainder is unpriced, or the product lacks a hub price. */
  unpriceable: boolean;
  recommendation: BuildRecommendation;
}
