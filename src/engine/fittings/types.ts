import type { AppliedDpsInputs } from './appliedDps';
import type { CapacitorBudget } from './tank';
import type { SupportStats } from './support';
import type { ExploreStats } from './explore';
import type { ModuleFigures } from './moduleFigures';
import type { MiningStats } from './mining';
import type { FleetSupportStats } from './fleetSupport';

export type FittingSlotKind = 'high' | 'medium' | 'low' | 'rig' | 'subsystem';

export const FITTING_SLOT_KINDS: readonly FittingSlotKind[] = [
  'high',
  'medium',
  'low',
  'rig',
  'subsystem',
];

export type FittingItemState = 'offline' | 'online' | 'active' | 'overload';

export type RackModule = Pick<FittingModule, 'slot' | 'typeId'>;

export interface ItemMutation {
  baseTypeId: number;
  mutaplasmidTypeId: number;
  attributes: Readonly<Record<number, number>>;
}

export interface FittingModule {
  slot: FittingSlotKind;
  slotIndex: number;
  typeId: number;
  state: FittingItemState;
  chargeTypeId?: number;
  chargeQuantity?: number;
  mutation?: ItemMutation;
}

export function sortFittingModules(modules: FittingModule[]): FittingModule[] {
  return modules.sort(
    (a, b) =>
      FITTING_SLOT_KINDS.indexOf(a.slot) - FITTING_SLOT_KINDS.indexOf(b.slot) ||
      a.slotIndex - b.slotIndex
  );
}

export interface FittingDrone {
  typeId: number;
  quantity: number;
  state: 'online' | 'active';
  mutation?: ItemMutation;
}

export interface FittingFighter {
  typeId: number;
  quantity: number;
  state: 'online' | 'active';
}

export interface FittingCargoItem {
  typeId: number;
  quantity: number;
}

export interface FittingImplantSet {
  implants: readonly number[];
  boosters: readonly number[];
  boosterSideEffects?: readonly number[];
}

export interface Fitting {
  name: string;
  shipTypeId: number;
  modules: FittingModule[];
  drones: FittingDrone[];
  cargo: FittingCargoItem[];
  implantSet?: FittingImplantSet;
  fighters?: FittingFighter[];
  mode?: number;
}

export interface PilotProfile {
  skillLevels: Map<number, number>;
  implantTypeIds: readonly number[];
  boosterTypeIds: readonly number[];
  boosterSideEffects?: readonly number[];
}

export interface ProjectedEffects {
  buffs: { id: number; value: number }[];
  effects: {
    typeId: number;
    effectId: number;
    attributes: Record<number, number>;
    quantity: number;
  }[];
}

export type CapacitorStatus =
  { stable: true; stablePercentage: number } | { stable: false; depletesInSeconds: number };

export interface PerDamageType {
  em: number;
  thermal: number;
  kinetic: number;
  explosive: number;
}

export type DamageProfile = PerDamageType;

export interface Resonances {
  emResonance: number;
  thermalResonance: number;
  kineticResonance: number;
  explosiveResonance: number;
}

export interface LayerDefense extends Resonances {
  hp: number;
  ehp: number;
}

export interface TargetingStats {
  maxTargetRange: number;
  maxLockedTargets: number;
  scanResolution: number;
  signatureRadius: number;
}

export interface NavigationStats {
  maxVelocity: number;
  agility: number;
  mass: number;
  warpSpeed: number;
}

export type SensorType = 'radar' | 'ladar' | 'magnetometric' | 'gravimetric';

export interface SensorStats {
  strength: number;
  type: SensorType | null;
}

export interface HoldStats {
  cargo: number;
  fleetHangar: number;
  miningHold: number;
  ammoHold: number;
  planetaryHold: number;
  commandCenterHold: number;
  mineralHold: number;
  gasHold: number;
  iceHold: number;
  fuelBay: number;
  infrastructureHold: number;
}

export interface JumpDriveStats {
  rangeLightYears: number;
  fuelTypeId: number;
  fuelPerLightYear: number;
}

export interface UsedOfTotal {
  used: number;
  total: number;
}

export interface FighterStats {
  dps: number;
  tubes: UsedOfTotal;
  light: UsedOfTotal;
  support: UsedOfTotal;
  heavy: UsedOfTotal;
  bay: UsedOfTotal;
}

export interface LockedTargets {
  ship: number;
  pilot: number;
  effective: number;
}

export type CountedRuleBreak =
  | {
      kind: 'max_group';
      groupId: number;
      limit: 'fitted' | 'online' | 'active';
      used: number;
      allowed: number;
    }
  | { kind: 'max_type'; typeId: number; used: number; allowed: number }
  | {
      kind: 'slots';
      slot: string;
      used: number;
      available: number;
    };

export interface ItemRuleBreak {
  kind:
    | 'wrong_slot'
    | 'slot_taken'
    | 'wrong_slot_index'
    | 'subsystem_taken'
    | 'rig_size'
    | 'ship_restricted'
    | 'capital_item'
    | 'structure_item'
    | 'ship_item'
    | 'charge_group'
    | 'charge_size'
    | 'not_a_module'
    | 'not_a_drone'
    | 'not_a_fighter'
    | 'not_an_implant'
    | 'not_a_hull'
    | 'not_a_mode'
    | 'not_a_skill';
  typeId: number | null;
}

export type RuleBreak = CountedRuleBreak | ItemRuleBreak;

export interface FittingStats {
  ruleBreaks: RuleBreak[];
  cpuUsed: number;
  cpuTotal: number;
  powergridUsed: number;
  powergridTotal: number;
  calibrationUsed: number;
  calibrationTotal: number;
  droneDps: number;
  droneBandwidthUsed: number;
  droneBandwidthTotal: number;
  maxActiveDrones: number;
  droneBandwidthByType: Record<number, number>;
  droneCapacity: number;
  hardpoints: HardpointCounts;
  ehp: number;
  capacitor: CapacitorStatus;
  capacitorCapacity: number;
  capacitorRechargeTime: number;
  shield: LayerDefense;
  armor: LayerDefense;
  hull: LayerDefense;
  targeting: TargetingStats;
  navigation: NavigationStats;
  unknownItemTypeIds: number[];
  slotCounts: Record<FittingSlotKind, number>;
  modules: FittingModuleResult[];
  offense: OffenseStats;
  repair: LocalRepair;
  capacitorBudget: CapacitorBudget;
  tank: TankStats;
  support: SupportStats;
  mining: MiningStats;
  explore: ExploreStats;
  moduleFigures: ModuleFigures;
  fleetSupport: FleetSupportStats;
  fighters: FighterStats;
  sensor: SensorStats;
  holds: HoldStats;
  jumpDrive: JumpDriveStats | null;
  lockedTargets: LockedTargets;
  allOverheated: boolean;
  unheated: FittingStats | null;
  overheated: OverheatedStats | null;
  applied: AppliedDpsInputs;
}

export interface WeaponRow {
  typeId: number;
  chargeTypeId?: number;
  isDrone: boolean;
  isFighter?: boolean;
  count: number;
  dps: number;
  sustainedDps: number;
  volley: number;
  overheated: DamageFigures | null;
  range?: WeaponRange;
  spool?: SpoolFigures;
}

export interface SpoolFigures {
  unspooledDps: number;
  secondsToFull: number;
}

export interface WeaponRange {
  optimal: number;
  falloff: number;
}

export interface DamageFigures {
  dps: number;
  sustainedDps: number;
  volley: number;
  unspooledDps?: number;
}

export interface OffenseStats {
  weapons: WeaponRow[];
  dps: number;
  sustainedDps: number;
  volley: number;
  overheated: DamageFigures | null;
  chargelessWeaponCount: number;
}

export interface LocalRepair {
  shield: number;
  armor: number;
  hull: number;
}

export interface AncillaryRepairer {
  typeId: number;
  layer: keyof LocalRepair;
  loaded: number;
  empty: number;
  isLoaded: boolean;
}

export interface TankStats {
  burst: LocalRepair;
  sustained: LocalRepair;
  passiveShield: number;
  burstEffective: number;
  sustainedEffective: number;
  capFraction: number;
  ancillary: AncillaryRepairer[];
}

export interface OverheatedStats {
  ehp: number;
  maxVelocity: number;
  repair: LocalRepair;
  shield: LayerDefense;
  armor: LayerDefense;
  hull: LayerDefense;
}

export interface FittingModuleResult {
  state: FittingItemState;
  maxState: FittingItemState;
  chargeGroupIds: number[];
  adaptedResonances?: Resonances;
}

export const DOGMA_ATTRIBUTE = {
  cpuOutput: 48,
  cpuFree: -9,
  powerOutput: 11,
  powerFree: -10,
  ehp: -43,
  shieldEhp: -30,
  armorEhp: -28,
  hullEhp: -29,
  droneDamagePerSecond: -14,
  capacitorStablePercentage: -72,
  capacitorDepletesIn: -7,
  armorRepairRate: -45,
  hullRepairRate: -46,
  shieldBoostRate: -47,
  capacitorPeakRecharge: -2,
  capacitorPeakLoad: -4,
  passiveShieldRechargeRate: -51,
  passiveShieldEffectiveRechargeRate: -52,
  scanStrength: -53,
  maxTargetsCharacter: -71,
  capacitorCapacity: 482,
  capacitorRechargeTime: 55,
  shieldCapacity: 263,
  shieldRechargeTime: 479,
  armorHp: 265,
  hullHp: 9,
  shieldEmResonance: 271,
  shieldExplosiveResonance: 272,
  shieldKineticResonance: 273,
  shieldThermalResonance: 274,
  armorEmResonance: 267,
  armorExplosiveResonance: 268,
  armorKineticResonance: 269,
  armorThermalResonance: 270,
  hullEmResonance: 113,
  hullExplosiveResonance: 111,
  hullKineticResonance: 109,
  hullThermalResonance: 110,
  maxTargetRange: 76,
  maxLockedTargets: 192,
  scanResolution: 564,
  signatureRadius: 552,
  maxVelocity: 37,
  agility: 70,
  mass: 4,
  turretHardpoints: 102,
  launcherHardpoints: 101,
  baseWarpSpeed: 1281,
  warpSpeedMultiplier: 600,
  droneBandwidth: 1271,
  droneCapacity: 283,
  calibration: 1132,
  hiSlots: 14,
  medSlots: 13,
  lowSlots: 12,
  rigSlots: 1137,
  subsystemSlots: 1367,
  scanRadarStrength: 208,
  scanLadarStrength: 209,
  scanMagnetometricStrength: 210,
  scanGravimetricStrength: 211,
  cargoCapacity: 38,
  fleetHangarCapacity: 912,
  miningHoldCapacity: 1556,
  specialAmmoHoldCapacity: 1573,
  specialPlanetaryCommoditiesHoldCapacity: 1653,
  specialCommandCenterHoldCapacity: 1646,
  specialMineralHoldCapacity: 1558,
  specialGasHoldCapacity: 1557,
  specialIceHoldCapacity: 3136,
  specialFuelBayCapacity: 1549,
  specialColonyResourcesHoldCapacity: 5646,
  jumpDriveRange: 867,
  jumpDriveConsumptionAmount: 868,
  jumpDriveConsumptionType: 866,
  fighterTubes: 2216,
  fighterLightSlots: 2217,
  fighterSupportSlots: 2218,
  fighterHeavySlots: 2219,
  fighterCapacity: 2055,
  fighterCapacityUsed: -57,
  fighterDamagePerSecond: -58,
  fighterHeavySlotsUsed: -59,
  fighterLightSlotsUsed: -60,
  fighterSupportSlotsUsed: -61,
  fighterTubesUsed: -62,
} as const;

export interface HardpointCounts {
  turrets: number;
  launchers: number;
}

export type StatsErrorReason = 'skills' | 'shipData';

export const CHARACTER_DOGMA_ATTRIBUTE = {
  maxActiveDrones: 352,
  maxLockedTargets: 192,
} as const;

export const CHARACTER_BASE_LOCKED_TARGETS = 2;

export const ITEM_DOGMA_ATTRIBUTE = {
  calibrationCost: 1153,
  droneBandwidthNeeded: 1272,
  chargeGroup1: 604,
  chargeGroup2: 605,
  chargeGroup3: 606,
  chargeGroup4: 609,
  chargeGroup5: 610,
  chargeSize: 128,
  rateOfFire: 51,
  techLevel: 422,
  crystalsTakeDamage: 786,
  crystalVolatility: 783,
  crystalVolatilityDamage: 784,
  structureHitpoints: 9,
  damagePerSecond: -12,
  damageVolley: -21,
  spoolBonusPerCycle: 2733,
  spoolBonusMax: 2734,
  resistanceShiftAmount: 1849,
  capacitorPeakLoad: -4,
  cycleTime: -3,
  chargeAmount: -8,
  capacitorInjectionAmount: -67,
  armorRepairRate: -45,
  hullRepairRate: -46,
  shieldBoostRate: -47,
  chargedArmorDamageMultiplier: 1886,
  chargeRate: 56,
  reloadTime: 1795,
  maxRange: 54,
} as const;

export const CHARGE_GROUP_ATTRIBUTES: readonly number[] = [
  ITEM_DOGMA_ATTRIBUTE.chargeGroup1,
  ITEM_DOGMA_ATTRIBUTE.chargeGroup2,
  ITEM_DOGMA_ATTRIBUTE.chargeGroup3,
  ITEM_DOGMA_ATTRIBUTE.chargeGroup4,
  ITEM_DOGMA_ATTRIBUTE.chargeGroup5,
];
