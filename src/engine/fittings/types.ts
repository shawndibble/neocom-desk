/**
 * Domain shapes for the Fittings section (ADR 0016, issue #1531). Kept free
 * of any `@eveshipfit/dogma-engine` import — including its types — so this
 * module stays swappable if the engine ever is (ADR 0016's "one seam module"
 * requirement); `src/features/fittings/dogmaFittingEngine.ts` is the only
 * place that talks to the vendor package, and maps these shapes onto its own.
 */

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

export interface FittingCargoItem {
  typeId: number;
  quantity: number;
}

/** An implant/booster set a Fitting carries, EVE's own slot order. */
export interface FittingImplantSet {
  implants: readonly number[];
  boosters: readonly number[];
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
}

export type CapacitorStatus =
  { stable: true; stablePercentage: number } | { stable: false; depletesInSeconds: number };

/** One layer's raw HP and its four resonances (0-1; a resist bar shows `1 - resonance`). */
export interface LayerDefense {
  hp: number;
  emResonance: number;
  thermalResonance: number;
  kineticResonance: number;
  explosiveResonance: number;
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
  droneCapacity: number;
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
  /**
   * The same fit recalculated by the engine with every active module that
   * can overheat set to overload; null when no module can (nothing to show).
   */
  overheated: OverheatedStats | null;
}

/** One Offense row: every firing copy of a weapon (same charge) or one drone type. */
export interface WeaponRow {
  typeId: number;
  chargeTypeId?: number;
  isDrone: boolean;
  /** Modules in the group, or drones in the stack. */
  count: number;
  /** Without reload. */
  dps: number;
  volley: number;
  /** Null when the row can't overheat — drones never do. */
  overheatedDps: number | null;
  overheatedVolley: number | null;
}

export interface OffenseStats {
  weapons: WeaponRow[];
  /** Sum of the rows. */
  dps: number;
  volley: number;
  /** Null when no row can overheat. */
  overheatedDps: number | null;
  overheatedVolley: number | null;
}

/** Local repair and boost rates, HP/s. */
export interface LocalRepair {
  shield: number;
  armor: number;
  hull: number;
}

export interface OverheatedStats {
  ehp: number;
  maxVelocity: number;
  repair: LocalRepair;
}

/** What the engine made of one fitted module. */
export interface FittingModuleResult {
  /** The state actually reached — lower than asked when the module can't get there. */
  state: FittingItemState;
  /** The highest state this module can reach at all; the state control offers nothing above it. */
  maxState: FittingItemState;
  /** Charge groups the module accepts (`chargeGroup1`…); empty when it takes no charge. */
  chargeGroupIds: number[];
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
  droneDamagePerSecond: -14,
  capacitorStablePercentage: -72,
  capacitorDepletesIn: -7,
  // Local repair rates, HP/s (same `patches/ids.yaml`, 2026-09-24; a live
  // run showed a Medium Armor Repairer II's rate rise under overload).
  armorRepairRate: -45,
  hullRepairRate: -46,
  shieldBoostRate: -47,
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
  hullEmResonance: 974,
  hullExplosiveResonance: 975,
  hullKineticResonance: 976,
  hullThermalResonance: 977,
  maxTargetRange: 76,
  maxLockedTargets: 192,
  scanResolution: 564,
  signatureRadius: 552,
  maxVelocity: 37,
  agility: 70,
  mass: 4,
  warpSpeed: 1281,
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
} as const;

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
  // Patched per-item damage (EVEShipFit/sde-patched `patches/ids.yaml`,
  // `damagePerSecondWithoutReload`/`damageVolley`), verified 2026-09-24 by a
  // live run of the pinned engine: a drone stack reports them per drone, and
  // an online (not firing) launcher still reports its volley.
  damagePerSecond: -12,
  damageVolley: -21,
} as const;

export const CHARGE_GROUP_ATTRIBUTES: readonly number[] = [
  ITEM_DOGMA_ATTRIBUTE.chargeGroup1,
  ITEM_DOGMA_ATTRIBUTE.chargeGroup2,
  ITEM_DOGMA_ATTRIBUTE.chargeGroup3,
  ITEM_DOGMA_ATTRIBUTE.chargeGroup4,
  ITEM_DOGMA_ATTRIBUTE.chargeGroup5,
];
