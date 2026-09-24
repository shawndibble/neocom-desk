/**
 * Domain shapes for the Fittings section (ADR 0016, issue #1531). Kept free
 * of any `@eveshipfit/dogma-engine` import — including its types — so this
 * module stays swappable if the engine ever is (ADR 0016's "one seam module"
 * requirement); `src/features/fittings/dogmaFittingEngine.ts` is the only
 * place that talks to the vendor package, and maps these shapes onto its own.
 */

export type FittingSlotKind = 'high' | 'medium' | 'low' | 'rig' | 'subsystem';

export type FittingItemState = 'offline' | 'online' | 'active' | 'overload';

export interface FittingModule {
  slot: FittingSlotKind;
  /** Position within the slot's own rack, starting at 0. */
  slotIndex: number;
  typeId: number;
  state: FittingItemState;
  chargeTypeId?: number;
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

/**
 * One ship hull plus everything loaded into it (CONTEXT.md **Fitting**).
 * Implants are deliberately not here: for this ticket they always come from
 * the active Character's clone, via `PilotProfile` — a later ticket adds the
 * option for a Fitting to carry its own implant/booster set.
 */
export interface Fitting {
  name: string;
  shipTypeId: number;
  modules: FittingModule[];
  drones: FittingDrone[];
  cargo: FittingCargoItem[];
}

/**
 * The skills and implants a Fitting's stats are worked out under. Built from
 * the active Character (trained skills at Effective Skill Level, implants
 * from the active clone) or, for the logged-out share view, `buildAllVProfile`.
 */
export interface PilotProfile {
  /** Effective Skill Level (CONTEXT.md) per skill type id. Missing = untrained. */
  skillLevels: Map<number, number>;
  /** Type ids of the implants in play, EVE's own implant-slot order. */
  implantTypeIds: readonly number[];
}

export type CapacitorStatus =
  { stable: true; stablePercentage: number } | { stable: false; depletesInSeconds: number };

export interface FittingStats {
  cpuUsed: number;
  cpuTotal: number;
  powergridUsed: number;
  powergridTotal: number;
  droneDps: number;
  ehp: number;
  capacitor: CapacitorStatus;
  /** Type ids the pinned data has nothing for; the rest of the fit still calculates. */
  unknownItemTypeIds: number[];
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
} as const;
