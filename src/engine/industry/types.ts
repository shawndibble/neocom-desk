import type { EngineAsset } from '../assetTree';
import type { MaterialRecipe } from './makeOrBuy';
import type { ResolvedMaterial } from './materialResolution';
import type { CharacterModifiers } from './characterModifiers';
import {
  parseRigKind,
  rigReaches,
  type ProductRigScope,
  type ScopedRigKind,
  type UnscopedRigKind,
} from './rigScope';
import type { ResolvedStandings } from '@/engine/market/standings';

export interface QuantityEntry {
  typeID: number;
  quantity: number;
}

export type IndustryActivity = 'manufacturing' | 'reaction';

export interface BlueprintSkillRequirement {
  typeID: number;
  level: number;
}

export interface IndustryBlueprint {
  name: string;
  time: number;
  materials: QuantityEntry[];
  products: QuantityEntry[];
  activity?: IndustryActivity;
  skills?: readonly BlueprintSkillRequirement[];
  maxProductionLimit?: number;
  rigScope?: ProductRigScope;
}

export function industryActivityOf(blueprint: IndustryBlueprint): IndustryActivity {
  return blueprint.activity ?? 'manufacturing';
}

export const MAX_JOB_RUNS = 1_000_000;

export type RigLevel = 'none' | 't1' | 't2';

export type RigKind = 'none' | UnscopedRigKind | ScopedRigKind;

export const RIG_SLOT_COUNT = 3;

export type RigFit = readonly [RigKind, RigKind, RigKind];

export const EMPTY_RIG_FIT: RigFit = ['none', 'none', 'none'];

export const RIG_KIND_OPTIONS: readonly RigKind[] = ['none', 'meT1', 'meT2', 'teT1', 'teT2'];

export function normalizeRigFit(fit: readonly RigKind[] | undefined | null): RigFit {
  const slots = fit ?? [];
  return [slots[0] ?? 'none', slots[1] ?? 'none', slots[2] ?? 'none'];
}

export function setRigSlot(fit: RigFit, slot: number, kind: RigKind): RigFit {
  const next = [...fit];
  next[slot] = kind;
  return normalizeRigFit(next);
}

export function rigFitFromLegacyLevel(level: RigLevel): RigFit {
  if (level === 't1') return ['meT1', 'teT1', 'none'];
  if (level === 't2') return ['meT2', 'teT2', 'none'];
  return EMPTY_RIG_FIT;
}

export function resolveRigFit(source: {
  rigFit?: readonly RigKind[];
  rigLevel?: RigLevel;
}): RigFit {
  if (source.rigFit !== undefined) return normalizeRigFit(source.rigFit);
  if (source.rigLevel !== undefined) return rigFitFromLegacyLevel(source.rigLevel);
  return EMPTY_RIG_FIT;
}

export type SecurityBand = 'highsec' | 'lowsec' | 'nullsec';

export type FacilityKind = 'npcStation' | 'raitaru' | 'azbel' | 'sotiyo' | 'athanor' | 'tatara';

export interface FacilityPreset {
  kind: FacilityKind;
  name: string;
  activity: IndustryActivity;
  structure: boolean;
  materialBonusPct: number;
  timeBonusPct: number;
  jobCostBonusPct: number;
  defaultTaxPct: number;
}

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

const RIG_KIND_BONUS: Readonly<Record<UnscopedRigKind, { type: RigBonusType; pct: number }>> = {
  meT1: { type: 'me', pct: 2 },
  meT2: { type: 'me', pct: 2.4 },
  teT1: { type: 'te', pct: 20 },
  teT2: { type: 'te', pct: 24 },
};

export const RIG_SECURITY_MULTIPLIER: Record<SecurityBand, number> = {
  highsec: 1,
  lowsec: 1.9,
  nullsec: 2.1,
};

export const REACTION_RIG_SECURITY_MULTIPLIER: Record<SecurityBand, number> = {
  highsec: 1,
  lowsec: 1,
  nullsec: 1.1,
};

export function rigSecurityMultiplierFor(activity: IndustryActivity): Record<SecurityBand, number> {
  return activity === 'reaction' ? REACTION_RIG_SECURITY_MULTIPLIER : RIG_SECURITY_MULTIPLIER;
}

const STACKING_PENALTY_MULTIPLIERS: readonly number[] = [1, 0.869, 0.571];

function stackedRigBonusPct(
  fit: RigFit,
  bonusType: RigBonusType,
  productScope: ProductRigScope | undefined
): number {
  const contributions = fit
    .map((kind) => {
      const parsed = parseRigKind(kind);
      if (parsed === null || parsed.line !== bonusType) return null;
      return rigReaches(parsed.target, productScope)
        ? RIG_KIND_BONUS[`${parsed.line}${parsed.tier}`].pct
        : null;
    })
    .filter((pct): pct is number => pct !== null)
    .sort((a, b) => b - a);
  return contributions.reduce(
    (sum, pct, i) => sum + pct * (STACKING_PENALTY_MULTIPLIERS[i] ?? 0),
    0
  );
}

export function rigBonusPct(
  fit: RigFit,
  bonusType: RigBonusType,
  activity: IndustryActivity,
  security: SecurityBand,
  productScope?: ProductRigScope
): number {
  return (
    stackedRigBonusPct(fit, bonusType, productScope) * rigSecurityMultiplierFor(activity)[security]
  );
}

export const FACILITY_KIND_BY_STRUCTURE_TYPE_ID: Readonly<Record<number, FacilityKind>> = {
  35825: 'raitaru',
  35826: 'azbel',
  35827: 'sotiyo',
  35835: 'athanor',
  35836: 'tatara',
};

export const SCC_SURCHARGE_PCT = 4;

export const SKILL_IDS = {
  industry: 3380,
  advancedIndustry: 3388,
  reactions: 45746,
  accounting: 16622,
  brokerRelations: 3446,
  advancedBrokerRelations: 16597,
  reprocessing: 3385,
  reprocessingEfficiency: 3389,
  scrapmetalProcessing: 12196,
} as const;

export const MANUFACTURING_TIME_SCIENCE_SKILL_PCT: Readonly<Record<number, number>> = {
  3395: 1,
  3396: 1,
  3397: 1,
  3398: 1,
  3400: 1,
  11433: 1,
  11441: 1,
  11442: 1,
  11443: 1,
  11444: 1,
  11445: 1,
  11446: 1,
  11447: 1,
  11448: 1,
  11449: 1,
  11450: 1,
  11451: 1,
  11452: 1,
  11453: 1,
  11454: 1,
  11455: 1,
  11529: 1,
  52307: 1,
  77725: 1,
  81050: 1,
  81896: 2,
};

export type SkillLevels = Record<number, number>;

export interface FacilityContext {
  facility: FacilityPreset;
  rigFit: RigFit;
  security: SecurityBand;
}

export interface ReactionFacilityContext extends FacilityContext {
  facilityTaxPct?: number;
  systemCostIndex: number;
}

export type AdjustedPrices = Record<number, number>;

export type HubPrices = Record<number, number>;

export type MaterialPriceBasis = 'sell' | 'buy';

export interface IndustryInputs {
  blueprint: IndustryBlueprint;
  runs: number;
  me: number;
  te: number;
  facility: FacilityPreset;
  rigFit: RigFit;
  security: SecurityBand;
  facilityTaxPct?: number;
  systemCostIndex: number;
  regionalTaxPct?: number;
  adjustedPrices: AdjustedPrices;
  hubPrices: HubPrices;
  materialPrices?: HubPrices;
  materialSourcing?: MaterialSourcingMap;
  modifiers: CharacterModifiers;
  standing?: ResolvedStandings;
  buildHere?: readonly number[];
  recipeFor?: (typeID: number) => MaterialRecipe | null;
  acquisitionFor?: (
    productTypeID: number,
    needed: number,
    ctx: FacilityContext & {
      facilityTaxPct?: number;
      systemCostIndex: number;
      adjustedPrices: AdjustedPrices;
      modifiers: CharacterModifiers;
    },
    materialPrices: HubPrices
  ) => AcquisitionResolution | null;
  reactionFacility?: ReactionFacilityContext;
  blueprintAcquisition?: {
    blueprintTypeID: number;
    line: AcquisitionLine | null;
  };
}

export interface JobFeeBreakdown {
  eiv: number;
  grossCost: number;
  sccSurcharge: number;
  facilityTax: number;
  regionalTax?: number;
  total: number;
}

export interface EffectiveMaterial {
  typeID: number;
  baseQuantity: number;
  quantity: number;
}

export interface MaterialSourcing {
  ownedQuantity?: number;
  overridePrice?: number;
  acquisitionTierOverride?: {
    me: number;
    te: number;
    invented?: { runs: number };
  };
}

export type MaterialSourcingMap = Record<number, MaterialSourcing>;

export interface OwnedStockLocation {
  characterId: number;
  corporationId?: number;
  locationId: number;
  locationType: EngineAsset['location_type'];
}

export interface OwnedStockHangar extends OwnedStockLocation {
  division: number;
}

export type OwnedStockScope =
  | { mode: 'everywhere' }
  | {
      mode: 'selected';
      locations: readonly OwnedStockLocation[];
      excludedContainers?: readonly number[];
      hangars?: readonly OwnedStockHangar[];
      containers?: readonly number[];
    };

export interface AcquisitionCommunitySource {
  memberName: string;
  stale: boolean;
}

export interface BlueprintRunPool {
  neededRuns: number;
  ownedRuns: number;
  copyRuns: number | null;
  copyPrice: number | null;
}

export type AcquisitionTier = {
  me: number;
  te: number;
  community?: AcquisitionCommunitySource;
  invented?: true;
  pool?: BlueprintRunPool;
  copyOnly?: true;
};

export interface AcquisitionLine {
  unitPrice: number | null;
  owned: boolean;
  quantity?: number;
  pool?: BlueprintRunPool;
  community?: AcquisitionCommunitySource;
  invented?: true;
}

export interface AcquisitionResolution {
  me: number;
  te: number;
  blueprintTypeID: number;
  line: AcquisitionLine | null;
  coverage?: { coveredRuns: number; neededRuns: number };
  copyOnly?: true;
}

export interface MaterialCostLine extends EffectiveMaterial {
  ownedQuantity: number;
  remainingQuantity: number;
  unitPrice: number | null;
  lineCost: number;
  unpriced: boolean;
  acquisitionTier?: AcquisitionTier;
}

export type BuildRecommendation = 'build' | 'buy' | 'unknown';

export interface BuildResult {
  materials: ResolvedMaterial[];
  jobRuns?: number[];
  seconds: number;
  jobFee: JobFeeBreakdown;
  materialCost: number;
  totalCost: number;
  buyCost: number | null;
  revenue: number | null;
  salesTax: number | null;
  brokerFee: number | null;
  netRevenue: number | null;
  profit: number | null;
  marginPct: number | null;
  iskPerHour: number | null;
  grossProfit: number | null;
  grossMargin: number | null;
  grossIskPerHour: number | null;
  breakEvenPrice: number | null;
  unpricedMaterials: number[];
  unpriceable: boolean;
  recommendation: BuildRecommendation;
}
