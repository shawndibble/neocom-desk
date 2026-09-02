/**
 * Pure manufacturing-math engine types (v1: manufacturing only).
 * Decoupled from src/sde — callers adapt SDE BlueprintType to IndustryBlueprint.
 *
 * Formula sources (verified 2026-08):
 * - EVE University wiki "Manufacturing": job cost formula, skill time bonuses,
 *   SCC surcharge 4%, NPC facility tax 0.25%, per-job material rounding.
 * - EVE University wiki "Upwell structures": engineering complex bonuses.
 * - EVE University wiki "Trading": sales tax / broker fee.
 * - everef.net dogma attributes: Standup M-Set rig bonuses and security
 *   multipliers (e.g. types 43920/43921/37160).
 */

export interface QuantityEntry {
  typeID: number;
  quantity: number;
}

/** Blueprint shape the engine needs (manufacturing activity). */
export interface IndustryBlueprint {
  name: string;
  /** Base manufacturing time in seconds per run. */
  time: number;
  materials: QuantityEntry[];
  products: QuantityEntry[];
}

export type RigLevel = 'none' | 't1' | 't2';

/** Security band of the facility's solar system. Wormholes count as nullsec. */
export type SecurityBand = 'highsec' | 'lowsec' | 'nullsec';

export type FacilityKind = 'npcStation' | 'raitaru' | 'azbel' | 'sotiyo';

export interface FacilityPreset {
  kind: FacilityKind;
  name: string;
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
 */
export const FACILITY_PRESETS: Record<FacilityKind, FacilityPreset> = {
  npcStation: {
    kind: 'npcStation',
    name: 'NPC station',
    structure: false,
    materialBonusPct: 0,
    timeBonusPct: 0,
    jobCostBonusPct: 0,
    defaultTaxPct: 0.25,
  },
  raitaru: {
    kind: 'raitaru',
    name: 'Raitaru',
    structure: true,
    materialBonusPct: 1,
    timeBonusPct: 15,
    jobCostBonusPct: 3,
    defaultTaxPct: 0,
  },
  azbel: {
    kind: 'azbel',
    name: 'Azbel',
    structure: true,
    materialBonusPct: 1,
    timeBonusPct: 20,
    jobCostBonusPct: 4,
    defaultTaxPct: 0,
  },
  sotiyo: {
    kind: 'sotiyo',
    name: 'Sotiyo',
    structure: true,
    materialBonusPct: 1,
    timeBonusPct: 30,
    jobCostBonusPct: 5,
    defaultTaxPct: 0,
  },
};

/**
 * Standup M-Set manufacturing rig base bonuses, percent.
 * Source: everef.net dogma (M-Set ME I -2%, ME II -2.4%, TE I -20%, TE II -24%).
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

export type BuildRecommendation = 'build' | 'buy' | 'unknown';

export interface BuildResult {
  materials: EffectiveMaterial[];
  /** Job duration in seconds. */
  seconds: number;
  jobFee: JobFeeBreakdown;
  /** Hub cost of priced materials (unpriced ones excluded and flagged). */
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
  /** Material typeIDs with no hub price. */
  unpricedMaterials: number[];
  /** True when any material or the product lacks a hub price. */
  unpriceable: boolean;
  recommendation: BuildRecommendation;
}
