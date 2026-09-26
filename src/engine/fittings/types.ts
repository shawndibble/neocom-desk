/**
 * Domain shapes for the Fittings section (ADR 0016, issue #1531). Kept free
 * of any `@eveshipfit/dogma-engine` import — including its types — so this
 * module stays swappable if the engine ever is (ADR 0016's "one seam module"
 * requirement); `src/features/fittings/dogmaFittingEngine.ts` is the only
 * place that talks to the vendor package, and maps these shapes onto its own.
 */
import type { AppliedDpsInputs } from './appliedDps';
import type { CapacitorBudget } from './tank';
import type { SupportStats } from './support';
import type { MiningStats } from './mining';

export type FittingSlotKind = 'high' | 'medium' | 'low' | 'rig' | 'subsystem';

/** Canonical rack order — the List view's own display order, and the one source `eftLoader.ts` and `shareMapper.ts` sort/iterate by. */
export const FITTING_SLOT_KINDS: readonly FittingSlotKind[] = [
  'high',
  'medium',
  'low',
  'rig',
  'subsystem',
];

export type FittingItemState = 'offline' | 'online' | 'active' | 'overload';

export interface FittingModule {
  slot: FittingSlotKind;
  /** Position within the slot's own rack, starting at 0. */
  slotIndex: number;
  typeId: number;
  state: FittingItemState;
  chargeTypeId?: number;
  /**
   * How many of the charge the app took out of this Fitting's own cargo to
   * load it — the only count it can prove, so the only one a swap from cargo
   * gives back. Absent for a charge from anywhere else (the Add panel, a
   * Load, a Share Link): that one never left the hold, so nothing returns to
   * it. Session-only: no share or export format carries it, so a decoded or
   * reopened Fitting has none.
   */
  chargeQuantity?: number;
}

/**
 * Sorts modules into the List view's own display order — `FITTING_SLOT_KINDS`
 * order, slot index ascending within each rack — regardless of the order a
 * loader (EFT paste, In-game Fittings) happened to encounter them in.
 */
export function sortFittingModules(modules: FittingModule[]): FittingModule[] {
  return modules.sort(
    (a, b) =>
      FITTING_SLOT_KINDS.indexOf(a.slot) - FITTING_SLOT_KINDS.indexOf(b.slot) ||
      a.slotIndex - b.slotIndex
  );
}

export interface FittingDrone {
  typeId: number;
  /** Stack size, matching how many of this drone type are in the bay. */
  quantity: number;
  /** Launched and engaging, vs. sitting in the bay. */
  state: 'online' | 'active';
}

/** One fighter squadron: its size, and whether it is launched from a tube or waits in the bay. */
export interface FittingFighter {
  typeId: number;
  /** Fighters in the squadron. */
  quantity: number;
  /** 'active': in a launch tube, fighting; 'online': in the fighter bay. */
  state: 'online' | 'active';
}

export interface FittingCargoItem {
  typeId: number;
  quantity: number;
}

/** An implant/booster set a Fitting carries, EVE's own slot order. */
export interface FittingImplantSet {
  implants: readonly number[];
  boosters: readonly number[];
  /**
   * The boosters' side effects switched on, by effect id
   * (`boosterSideEffects.ts`); absent or empty: none, as a booster is
   * assumed to roll none.
   */
  boosterSideEffects?: readonly number[];
}

/**
 * One ship hull plus everything loaded into it (CONTEXT.md **Fitting**).
 * `implantSet`, when carried, is what a "Fitting's" implant basis toggle
 * reads from; `undefined` means stats fall back to the active Character's
 * clone via `PilotProfile` instead.
 */
export interface Fitting {
  name: string;
  shipTypeId: number;
  modules: FittingModule[];
  drones: FittingDrone[];
  cargo: FittingCargoItem[];
  implantSet?: FittingImplantSet;
  /** Fighter squadrons, on a hull with fighter tubes; absent: none. */
  fighters?: FittingFighter[];
  /**
   * A Tactical Destroyer's mode (`tacticalModes.ts`), by type id. Absent on a
   * hull with modes means its default one; ignored on any other hull.
   */
  mode?: number;
}

/**
 * The skills and implants a Fitting's stats are worked out under. Built from
 * the active Character (trained skills at Effective Skill Level, implants
 * from the active clone) or, for the logged-out share view, `buildAllVProfile`.
 * `boosterTypeIds` is always empty from those two builders — ESI exposes no
 * "active booster" read — and only becomes non-empty via `applyImplantBasis`
 * switching to a Fitting's own carried set.
 */
export interface PilotProfile {
  /** Effective Skill Level (CONTEXT.md) per skill type id. Missing = untrained. */
  skillLevels: Map<number, number>;
  /** Type ids of the implants in play, EVE's own implant-slot order. */
  implantTypeIds: readonly number[];
  /** Type ids of the combat boosters in play, EVE's own booster-slot order. */
  boosterTypeIds: readonly number[];
  /** The boosters' side effects switched on, by effect id; absent: none. */
  boosterSideEffects?: readonly number[];
}

/**
 * What one Fitting hands another: command-burst buffs and projected module
 * effects (remote repair, webs, neutralizers…) — the engine's own
 * "outgoing"/"incoming" projection, in our own shape (ADR 0016: nothing here
 * imports the engine's types). A buff is a `dbuffCollections` id and its
 * strength; an effect is the projecting type, its dogma effect and every
 * attribute value the effect reads.
 */
export interface ProjectedEffects {
  buffs: { id: number; value: number }[];
  effects: { typeId: number; effectId: number; attributes: Record<number, number> }[];
}

export const NO_PROJECTED_EFFECTS: ProjectedEffects = { buffs: [], effects: [] };

export type CapacitorStatus =
  { stable: true; stablePercentage: number } | { stable: false; depletesInSeconds: number };

/**
 * One number for each of EVE's four damage types. What the number means is
 * the named type's to say: `DamageProfile` (weights), `TargetResists`
 * (shares resisted), `DamageSplit` (shares of a weapon's damage).
 */
export interface PerDamageType {
  em: number;
  thermal: number;
  kinetic: number;
  explosive: number;
}

/**
 * The incoming damage mix EHP is measured against (a Damage Profile,
 * CONTEXT.md) — relative weights, not fractions; only the ratio matters. Our
 * own shape rather than the engine's (ADR 0016: nothing here imports it).
 */
export type DamageProfile = PerDamageType;

/** Four resonances (0-1; a resist bar shows `1 - resonance`). */
export interface Resonances {
  emResonance: number;
  thermalResonance: number;
  kineticResonance: number;
  explosiveResonance: number;
}

/**
 * One layer's raw HP, its four resonances, and its EHP under the Damage
 * Profile the stats were calculated with — only `ehp` moves with the profile.
 */
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
  /** "Inertia Modifier" — lower is more agile. */
  agility: number;
  mass: number;
  /** AU/s */
  warpSpeed: number;
}

export type SensorType = 'radar' | 'ladar' | 'magnetometric' | 'gravimetric';

export interface SensorStats {
  strength: number;
  /** Which of the four the hull has; null for none. */
  type: SensorType | null;
}

/** Hold capacities, m³; 0 where the hull has no such hold. */
export interface HoldStats {
  cargo: number;
  fleetHangar: number;
  miningHold: number;
}

export interface JumpDriveStats {
  rangeLightYears: number;
  /** The isotope the drive burns. */
  fuelTypeId: number;
  /** Isotopes a light year, under the pilot's skills. */
  fuelPerLightYear: number;
}

/**
 * How many targets can be locked: the hull's own limit, the pilot's (two
 * untrained, one more a level of Target Management and of Advanced Target
 * Management), and the lower of the two, which is what counts.
 */
/** What of something the hull has is used. */
export interface UsedOfTotal {
  used: number;
  total: number;
}

/** Fighter tubes, each class's squadron limit, the fighter bay (m³), and the launched squadrons' DPS. */
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

export interface FittingStats {
  cpuUsed: number;
  cpuTotal: number;
  powergridUsed: number;
  powergridTotal: number;
  /** Rig calibration, points. */
  calibrationUsed: number;
  calibrationTotal: number;
  droneDps: number;
  droneBandwidthUsed: number;
  droneBandwidthTotal: number;
  /** Drones the pilot can control at once — the Drones skill's count; 0 without it. */
  maxActiveDrones: number;
  /** Mbit/s one drone of each type in the Fitting draws, whether launched or not. */
  droneBandwidthByType: Record<number, number>;
  droneCapacity: number;
  /** The hull's turret and launcher hardpoints; what the high slots take is `countHardpoints`. */
  hardpoints: HardpointCounts;
  ehp: number;
  capacitor: CapacitorStatus;
  capacitorCapacity: number;
  /** Seconds for a full recharge cycle (the game's own RC time, not time-to-any-level). */
  capacitorRechargeTime: number;
  shield: LayerDefense;
  armor: LayerDefense;
  hull: LayerDefense;
  targeting: TargetingStats;
  navigation: NavigationStats;
  /** Type ids the pinned data has nothing for; the rest of the fit still calculates. */
  unknownItemTypeIds: number[];
  /** How many slots each rack has — a ship attribute, so a Tech 3 subsystem's added slots count. */
  slotCounts: Record<FittingSlotKind, number>;
  /** Index-parallel to `Fitting.modules`. */
  modules: FittingModuleResult[];
  offense: OffenseStats;
  repair: LocalRepair;
  /** Peak recharge against what the running modules draw (`tank.ts`). */
  capacitorBudget: CapacitorBudget;
  tank: TankStats;
  /** What the running modules do to another ship (`support.ts`). */
  support: SupportStats;
  /** Yield of the running miners and launched mining drones (`mining.ts`). */
  mining: MiningStats;
  fighters: FighterStats;
  sensor: SensorStats;
  holds: HoldStats;
  /** Null on a hull without a jump drive. */
  jumpDrive: JumpDriveStats | null;
  /** `targeting.maxLockedTargets` is `lockedTargets.effective`. */
  lockedTargets: LockedTargets;
  /**
   * Every figure was worked out with every module that can overheat
   * overloaded (the "Overheat all" switch); `overheated` is then null, since
   * the heated values are the values.
   */
  allOverheated: boolean;
  /**
   * With `allOverheated`, the same figures unheated — what the page compares
   * each figure against, so only those heat changes read as heated
   * (`unheatedIfChanged`). Null otherwise, and always null on itself.
   */
  unheated: FittingStats | null;
  /**
   * The same fit recalculated by the engine with every active module that
   * can overheat set to overload; null when no module can (nothing to show).
   */
  overheated: OverheatedStats | null;
  /** What applied DPS against a Target Profile is worked out from (`appliedDps.ts`). */
  applied: AppliedDpsInputs;
}

/** One Offense row: every firing copy of a weapon (same charge) or one drone type. */
export interface WeaponRow {
  typeId: number;
  chargeTypeId?: number;
  /** Drones and fighters: launched, never overheated. */
  isDrone: boolean;
  /** Fighter squadrons of the type, rather than drones. */
  isFighter?: boolean;
  /** Modules in the group, or drones in the stack. */
  count: number;
  /** Without reload. */
  dps: number;
  volley: number;
  /** Null when the row can't overheat — drones never do. */
  overheated: DamageFigures | null;
}

export interface DamageFigures {
  dps: number;
  volley: number;
}

export interface OffenseStats {
  weapons: WeaponRow[];
  /** Sum of the rows. */
  dps: number;
  volley: number;
  /** Null when no row can overheat. */
  overheated: DamageFigures | null;
  /**
   * Active turrets/launchers dropped from `weapons` because no charge is
   * loaded — as opposed to genuinely not being active. Lets an empty-state
   * hint blame the missing charge instead of "set active".
   */
  chargelessWeaponCount: number;
}

/** Local repair and boost rates, HP/s. */
export interface LocalRepair {
  shield: number;
  armor: number;
  hull: number;
}

/** An ancillary armor repairer: its rate with paste and without, whichever it is running. */
export interface AncillaryRepairer {
  typeId: number;
  layer: keyof LocalRepair;
  /** HP/s with paste loaded. */
  loaded: number;
  /** HP/s running dry. */
  empty: number;
  /** Paste is loaded now. */
  isLoaded: boolean;
}

/**
 * Local tank, burst beside sustained (`tank.ts`): burst is every repairer at
 * full speed as the engine reports it; sustained is what the capacitor and
 * ancillary reloads let them average.
 */
export interface TankStats {
  /** HP/s. */
  burst: LocalRepair;
  /** HP/s. */
  sustained: LocalRepair;
  /** Passive shield regeneration at its peak, HP/s. */
  passiveShield: number;
  /**
   * EHP/s under the Damage Profile — each layer's HP/s scaled by its EHP ÷
   * HP — with passive shield regeneration included.
   */
  burstEffective: number;
  sustainedEffective: number;
  /** The share (0–1) of the capacitor-using repairers' draw the capacitor can feed; below 1 the tank is cap-limited. */
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

/** What the engine made of one fitted module. */
export interface FittingModuleResult {
  /** The state actually reached — lower than asked when the module can't get there. */
  state: FittingItemState;
  /** The highest state this module can reach at all; the state control offers nothing above it. */
  maxState: FittingItemState;
  /** Charge groups the module accepts (`chargeGroup1`…); empty when it takes no charge. */
  chargeGroupIds: number[];
  /**
   * A Reactive Armor Hardener's own resonances, as the engine adapted them to
   * the calculation's Damage Profile; absent on every other module.
   */
  adaptedResonances?: Resonances;
}

/**
 * Ship-level dogma attribute ids this seam reads off a calculation.
 *
 * The first block is plain SDE attributes, verified 2026-09-24 against
 * Fuzzwork's `dgmAttributeTypes.csv` — the same source `scripts/build-sde.mjs`
 * bakes from (see that script's `dgmAttributeTypes.csv` entry).
 *
 * The second block is negative: derived attributes `@eveshipfit/sde`'s
 * patches add on top of the plain SDE (EVEShipFit/sde-patched
 * `patches/ids.yaml`, same date) so EHP, drone DPS and capacitor stability
 * come straight from the engine's own math instead of this app re-deriving
 * it — exactly the point of adopting the engine (ADR 0016).
 * `capacitorDepletesIn` reads -1 when the fit is cap stable, in which case
 * `capacitorStablePercentage` holds the settle point; otherwise it holds the
 * seconds until empty and `capacitorStablePercentage` reads 0.
 */
export const DOGMA_ATTRIBUTE = {
  cpuOutput: 48,
  cpuFree: -9,
  powerOutput: 11,
  powerFree: -10,
  ehp: -43,
  // Per-layer EHP under the calculation's damage profile, mapped by a live
  // run of the pinned engine against a Rifter under all-EM vs uniform
  // (2026-09-24): shield EHP = HP / EM resonance, and so on.
  shieldEhp: -30,
  armorEhp: -28,
  hullEhp: -29,
  droneDamagePerSecond: -14,
  capacitorStablePercentage: -72,
  capacitorDepletesIn: -7,
  // Local repair rates, HP/s (same `patches/ids.yaml`, 2026-09-24; a live
  // run showed a Medium Armor Repairer II's rate rise under overload).
  armorRepairRate: -45,
  hullRepairRate: -46,
  shieldBoostRate: -47,
  // Capacitor peaks, GJ/s (same `patches/ids.yaml`; read out of the pinned
  // `sde.dat` 2026-09-25). Peak recharge is 2.5 × capacity ÷ recharge time
  // (the default 2.5 times `capacitorCapacity` over `rechargeRate`, checked
  // by hand against a live run); peak load is every running module's draw,
  // with a cap booster's injection and a nosferatu's take netted off as
  // negative draws.
  capacitorPeakRecharge: -2,
  capacitorPeakLoad: -4,
  // Passive shield regeneration at its peak, 2.5 × shield HP ÷ recharge
  // time — raw HP/s, and EHP/s under the Damage Profile.
  passiveShieldRechargeRate: -51,
  passiveShieldEffectiveRechargeRate: -52,
  // The strongest of the four sensor strengths (a hull has one).
  scanStrength: -53,
  // What the ship can lock under its pilot's skills: the patched effect
  // assigns the character's own limit, and the engine keeps the lower of
  // it and the hull's. See `lockedTargetLimit` for the base it misses.
  maxTargetsCharacter: -71,
  // Everything below is a plain SDE attribute (verified 2026-09-24 the same
  // way as the block above, plus a live run of the pinned engine against a
  // Rifter — see git history for the probe): calculate() returns the ship's
  // own final value for these under their ordinary positive id, already
  // reflecting fitted modules and trained skills, so no derived/patched id is
  // needed for a total or a resonance the way cpuFree/powerFree needed one for
  // a *used* amount.
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
  // The ship's own structure resists (`emDamageResonance` and siblings). Not
  // 974-977 (`hullEmDamageResonance`…): those are the modifiers a Damage
  // Control carries, and a ship reads them as their default of 1.
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
  // The warp speed is base × multiplier: the base (1281) is 1 on every hull,
  // and the hull's own speed — plus any rig's bonus — is in the multiplier.
  // The hull's hardpoints: every one it has — the engine never subtracts
  // what is fitted (verified 2026-09-25: a Rifter reads 3 and 2 bare or armed).
  turretHardpoints: 102,
  launcherHardpoints: 101,
  baseWarpSpeed: 1281,
  warpSpeedMultiplier: 600,
  droneBandwidth: 1271,
  droneCapacity: 283,
  calibration: 1132,
  // Rack sizes, verified 2026-09-24 by a live run of the pinned engine
  // (Rifter 3/3/4/3, Loki 0/0/0 + 3 rigs + 5 subsystems before subsystems are
  // fitted); `rigSlots`/`maxSubSystems` are unpublished, so absent from
  // public/data/market/attributes.json.
  hiSlots: 14,
  medSlots: 13,
  lowSlots: 12,
  rigSlots: 1137,
  subsystemSlots: 1367,
  // Sensor strengths by type (plain SDE, looked up by name in the pinned
  // `sde.dat` 2026-09-25): a hull carries one of the four.
  scanRadarStrength: 208,
  scanLadarStrength: 209,
  scanMagnetometricStrength: 210,
  scanGravimetricStrength: 211,
  // Holds, m³ (plain SDE, same lookup): the cargo hold is `capacity`.
  cargoCapacity: 38,
  fleetHangarCapacity: 912,
  miningHoldCapacity: 1556,
  jumpDriveRange: 867,
  jumpDriveConsumptionAmount: 868,
  jumpDriveConsumptionType: 866,
  // Fighters: tubes and each class's squadron limit (plain SDE), the bay,
  // and what's used of each and the fighters' DPS (patched ids; a live run
  // of a Thanatos with two Templar I and a Cenobite I squadron launched,
  // 2026-09-25: tubes 4, light 3, support 2; used 3 / 2 / 1).
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

/** Turret and launcher hardpoints — a hull's, or those its high slots take. */
export interface HardpointCounts {
  turrets: number;
  launchers: number;
}

/** What a failed stats calculation was about: the pilot's skills, or the ship data and its calculation. */
export type StatsErrorReason = 'skills' | 'shipData';

/**
 * Read off the calculation's character result: "Max Active Drones", which
 * the Drones skill raises by one a level. Verified 2026-09-25 against the
 * pinned engine (Drones 0/3/5 → absent/3/5).
 */
export const CHARACTER_DOGMA_ATTRIBUTE = {
  maxActiveDrones: 352,
  // The targets the pilot's skills add: Target Management and Advanced
  // Target Management each +1 a level (their `maxTargetBonus`, 311, is 1).
  // The engine leaves out the character's own base of two
  // (`CHARACTER_BASE_LOCKED_TARGETS`): a live run reads 5 at Target
  // Management V alone and nothing untrained (2026-09-25).
  maxLockedTargets: 192,
} as const;

/** `maxLockedTargets` on the SDE's CharacterType (1373): what an untrained pilot can lock. */
export const CHARACTER_BASE_LOCKED_TARGETS = 2;

/**
 * Item-level (not ship-level) dogma attributes this seam reads off a fitted
 * item's own calculation result — a rig's calibration cost and a drone's
 * bandwidth draw are per-item, so unlike everything in `DOGMA_ATTRIBUTE`
 * there is no single ship-level "used" total to read; it's summed from these
 * across whichever items actually draw it (rigs; active/online drones).
 * Verified 2026-09-24 against a live run of the pinned engine.
 */
export const ITEM_DOGMA_ATTRIBUTE = {
  calibrationCost: 1153,
  droneBandwidthNeeded: 1272,
  // "Used with (Charge Group)" and "Charge size" in
  // public/data/market/attributes.json, and a live run of the pinned engine
  // against a 200mm AutoCannon II (groups 83 and 372, size 1), 2026-09-24.
  chargeGroup1: 604,
  chargeGroup2: 605,
  chargeGroup3: 606,
  chargeGroup4: 609,
  chargeGroup5: 610,
  chargeSize: 128,
  // "speed", shown as Rate of fire (ms). In the pinned `sde.dat`
  // (2026-09-25) every turret and launcher carries it and no module that
  // takes a charge only optionally does — no mining laser, strip miner, gas
  // or ice harvester, cap booster, ancillary repairer or scripted module —
  // so it marks a module that needs its charge to fire.
  rateOfFire: 51,
  // Patched per-item damage (EVEShipFit/sde-patched `patches/ids.yaml`,
  // `damagePerSecondWithoutReload`/`damageVolley`), verified 2026-09-24 by a
  // live run of the pinned engine: a drone stack reports them per drone, and
  // an online (not firing) launcher still reports its volley.
  damagePerSecond: -12,
  damageVolley: -21,
  // "resistanceShiftAmount" — only the Reactive Armor Hardener family carries
  // it (6 on a RAH, absent on a Damage Control II; live run of the pinned
  // engine, 2026-09-24). Marks the module whose own armor resonances
  // (DOGMA_ATTRIBUTE.armor*Resonance ids, read off the item) are adapted.
  resistanceShiftAmount: 1849,
  // Per-module capacitor and repair figures (patched ids, `patches/ids.yaml`
  // as read out of the pinned `sde.dat` 2026-09-25, and a live run): GJ/s the
  // module draws at full speed (negative for a cap booster or nosferatu), its
  // cycle in ms, charges it holds, GJ a cap booster's charge injects, and its
  // own repair rate in HP/s — a remote repairer's is what it hands out.
  capacitorPeakLoad: -4,
  cycleTime: -3,
  chargeAmount: -8,
  capacitorInjectionAmount: -67,
  armorRepairRate: -45,
  hullRepairRate: -46,
  shieldBoostRate: -47,
  // The ancillary armor repairer's paste multiplier (3 on a Medium AAR).
  chargedArmorDamageMultiplier: 1886,
  // Charges one cycle uses, and the reload, ms (plain SDE).
  chargeRate: 56,
  reloadTime: 1795,
  // Optimal range, metres: only modules that reach another ship carry one.
  maxRange: 54,
} as const;

export const CHARGE_GROUP_ATTRIBUTES: readonly number[] = [
  ITEM_DOGMA_ATTRIBUTE.chargeGroup1,
  ITEM_DOGMA_ATTRIBUTE.chargeGroup2,
  ITEM_DOGMA_ATTRIBUTE.chargeGroup3,
  ITEM_DOGMA_ATTRIBUTE.chargeGroup4,
  ITEM_DOGMA_ATTRIBUTE.chargeGroup5,
];
