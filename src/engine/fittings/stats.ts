import {
  CHARACTER_DOGMA_ATTRIBUTE,
  CHARGE_GROUP_ATTRIBUTES,
  DOGMA_ATTRIBUTE,
  ITEM_DOGMA_ATTRIBUTE,
  type CapacitorStatus,
  type DamageFigures,
  type FittingItemState,
  type FittingModuleResult,
  type FittingStats,
  type LayerDefense,
  type LocalRepair,
  type OffenseStats,
  type OverheatedStats,
  type WeaponRow,
  type Resonances,
} from './types';

interface AttributeMap {
  get(attributeId: number): { value: number } | undefined;
}

interface ItemCalculationResult {
  attributes: { size: number };
}

/** An item as `calculate()` was given it — the engine's own `FitItem` fields this seam reads. */
interface CalculatedItem {
  type_id: number;
  slot: { type: string };
}

function readAttribute(attributes: AttributeMap, attributeId: number): number {
  return attributes.get(attributeId)?.value ?? 0;
}

function defenseLayers(
  shipAttributes: AttributeMap
): Pick<FittingStats, 'shield' | 'armor' | 'hull'> {
  return {
    shield: layerDefense(
      shipAttributes,
      DOGMA_ATTRIBUTE.shieldCapacity,
      DOGMA_ATTRIBUTE.shieldEhp,
      DOGMA_ATTRIBUTE.shieldEmResonance,
      DOGMA_ATTRIBUTE.shieldThermalResonance,
      DOGMA_ATTRIBUTE.shieldKineticResonance,
      DOGMA_ATTRIBUTE.shieldExplosiveResonance
    ),
    armor: layerDefense(
      shipAttributes,
      DOGMA_ATTRIBUTE.armorHp,
      DOGMA_ATTRIBUTE.armorEhp,
      DOGMA_ATTRIBUTE.armorEmResonance,
      DOGMA_ATTRIBUTE.armorThermalResonance,
      DOGMA_ATTRIBUTE.armorKineticResonance,
      DOGMA_ATTRIBUTE.armorExplosiveResonance
    ),
    hull: layerDefense(
      shipAttributes,
      DOGMA_ATTRIBUTE.hullHp,
      DOGMA_ATTRIBUTE.hullEhp,
      DOGMA_ATTRIBUTE.hullEmResonance,
      DOGMA_ATTRIBUTE.hullThermalResonance,
      DOGMA_ATTRIBUTE.hullKineticResonance,
      DOGMA_ATTRIBUTE.hullExplosiveResonance
    ),
  };
}

/** A resist bar's percentage from the engine's raw resonance (0-1, lower is tougher). */
export function resistPct(resonance: number): number {
  return (1 - resonance) * 100;
}

function capacitorStatus(shipAttributes: AttributeMap): CapacitorStatus {
  const depletesInSeconds = readAttribute(shipAttributes, DOGMA_ATTRIBUTE.capacitorDepletesIn);
  if (depletesInSeconds < 0) {
    return {
      stable: true,
      stablePercentage: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.capacitorStablePercentage),
    };
  }
  return { stable: false, depletesInSeconds };
}

function localRepair(shipAttributes: AttributeMap): LocalRepair {
  return {
    shield: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.shieldBoostRate),
    armor: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.armorRepairRate),
    hull: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.hullRepairRate),
  };
}

function resonances(
  attributes: AttributeMap,
  emAttr: number,
  thermalAttr: number,
  kineticAttr: number,
  explosiveAttr: number
): Resonances {
  return {
    emResonance: readAttribute(attributes, emAttr),
    thermalResonance: readAttribute(attributes, thermalAttr),
    kineticResonance: readAttribute(attributes, kineticAttr),
    explosiveResonance: readAttribute(attributes, explosiveAttr),
  };
}

function layerDefense(
  shipAttributes: AttributeMap,
  hpAttr: number,
  ehpAttr: number,
  emAttr: number,
  thermalAttr: number,
  kineticAttr: number,
  explosiveAttr: number
): LayerDefense {
  return {
    hp: readAttribute(shipAttributes, hpAttr),
    ehp: readAttribute(shipAttributes, ehpAttr),
    ...resonances(shipAttributes, emAttr, thermalAttr, kineticAttr, explosiveAttr),
  };
}

/**
 * What limits the drones in space: how many the pilot controls, and each
 * drone type's bandwidth (read even for a stack still in the bay, which draws
 * none yet). `items`/`itemResults` are index-parallel, as `calculate()` takes and returns them.
 */
export function extractDroneLimits(
  items: readonly CalculatedItem[],
  itemResults: readonly { attributes: AttributeMap }[],
  characterAttributes: AttributeMap
): Pick<FittingStats, 'maxActiveDrones' | 'droneBandwidthByType'> {
  const droneBandwidthByType: Record<number, number> = {};
  items.forEach((item, index) => {
    const result = itemResults[index];
    if (item.slot.type !== 'drone_bay' || !result) return;
    droneBandwidthByType[item.type_id] = readAttribute(
      result.attributes,
      ITEM_DOGMA_ATTRIBUTE.droneBandwidthNeeded
    );
  });
  return {
    maxActiveDrones: readAttribute(characterAttributes, CHARACTER_DOGMA_ATTRIBUTE.maxActiveDrones),
    droneBandwidthByType,
  };
}

/**
 * A type id the pinned `sde.dat` has nothing for comes back from `calculate`
 * with an empty attribute map rather than failing the whole calculation
 * (verified against a live run of the pinned engine, 2026-09-24) — that's how
 * this seam tells an unresolvable item apart from a genuinely inert one,
 * which still carries its base SDE attributes.
 *
 * Cargo is never unknown: the engine calculates nothing for a cargo item, so
 * every one — a missile stack the launchers already fire, say — comes back
 * empty however well the data knows it.
 */
function isUnknownItem(item: CalculatedItem, result: ItemCalculationResult): boolean {
  return item.slot.type !== 'cargo' && result.attributes.size === 0;
}

/**
 * Reads the stats this ticket's fitting stats card needs off a calculation
 * (ADR 0016's seam). `items`/`itemResults` must be the same index-parallel
 * arrays `calculate()` was given and returned.
 *
 * Leaves out `calibrationUsed`/`droneBandwidthUsed`: unlike everything here,
 * those are summed from *item*-level attributes on whichever items actually
 * draw them (rigs; active/online drones) rather than read off one ship-level
 * id — `dogmaFittingEngine.ts` computes and adds them, since only it also
 * has `dogmaFit.items`' slot types to know which items those are.
 */
export function extractFittingStats(
  items: readonly CalculatedItem[],
  shipAttributes: AttributeMap,
  itemResults: readonly ItemCalculationResult[]
): Omit<
  FittingStats,
  | 'calibrationUsed'
  | 'droneBandwidthUsed'
  | 'maxActiveDrones'
  | 'droneBandwidthByType'
  | 'modules'
  | 'offense'
  | 'overheated'
  | 'applied'
> {
  const cpuTotal = readAttribute(shipAttributes, DOGMA_ATTRIBUTE.cpuOutput);
  const powergridTotal = readAttribute(shipAttributes, DOGMA_ATTRIBUTE.powerOutput);

  return {
    cpuTotal,
    cpuUsed: cpuTotal - readAttribute(shipAttributes, DOGMA_ATTRIBUTE.cpuFree),
    powergridTotal,
    powergridUsed: powergridTotal - readAttribute(shipAttributes, DOGMA_ATTRIBUTE.powerFree),
    calibrationTotal: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.calibration),
    droneDps: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.droneDamagePerSecond),
    droneBandwidthTotal: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.droneBandwidth),
    droneCapacity: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.droneCapacity),
    ehp: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.ehp),
    repair: localRepair(shipAttributes),
    capacitor: capacitorStatus(shipAttributes),
    capacitorCapacity: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.capacitorCapacity),
    capacitorRechargeTime: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.capacitorRechargeTime),
    ...defenseLayers(shipAttributes),
    targeting: {
      maxTargetRange: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.maxTargetRange),
      maxLockedTargets: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.maxLockedTargets),
      scanResolution: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.scanResolution),
      signatureRadius: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.signatureRadius),
    },
    navigation: {
      maxVelocity: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.maxVelocity),
      agility: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.agility),
      mass: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.mass),
      warpSpeed: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.warpSpeed),
    },
    unknownItemTypeIds: items
      .filter((item, index) => isUnknownItem(item, itemResults[index]))
      .map((item) => item.type_id),
    slotCounts: {
      high: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.hiSlots),
      medium: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.medSlots),
      low: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.lowSlots),
      rig: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.rigSlots),
      subsystem: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.subsystemSlots),
    },
  };
}

interface ModuleCalculationResult {
  attributes: AttributeMap;
  state: FittingItemState;
  max_state: FittingItemState;
}

/**
 * One fitted module's calculation, as the editor's state and charge controls
 * need it — plus, for a Reactive Armor Hardener, the resonances the engine
 * adapted it to.
 */
export function extractModuleResult(result: ModuleCalculationResult): FittingModuleResult {
  // Only a running RAH adapts; an online or offline one sits at its base
  // resists, and labelling those "adapted" would be wrong.
  const isAdaptingHardener =
    (result.state === 'active' || result.state === 'overload') &&
    readAttribute(result.attributes, ITEM_DOGMA_ATTRIBUTE.resistanceShiftAmount) > 0;
  return {
    state: result.state,
    maxState: result.max_state,
    chargeGroupIds: CHARGE_GROUP_ATTRIBUTES.map((id) =>
      readAttribute(result.attributes, id)
    ).filter((groupId) => groupId > 0),
    ...(isAdaptingHardener
      ? {
          adaptedResonances: resonances(
            result.attributes,
            DOGMA_ATTRIBUTE.armorEmResonance,
            DOGMA_ATTRIBUTE.armorThermalResonance,
            DOGMA_ATTRIBUTE.armorKineticResonance,
            DOGMA_ATTRIBUTE.armorExplosiveResonance
          ),
        }
      : {}),
  };
}

/** What `extractOffense` needs to know about one fitted module or drone stack. */
export interface OffenseItem {
  typeId: number;
  chargeTypeId?: number;
  quantity: number;
  isDrone: boolean;
}

function isFiring(state: FittingItemState): boolean {
  return state === 'active' || state === 'overload';
}

function damageFigures(attributes: AttributeMap, quantity: number): DamageFigures {
  return {
    dps: readAttribute(attributes, ITEM_DOGMA_ATTRIBUTE.damagePerSecond) * quantity,
    volley: readAttribute(attributes, ITEM_DOGMA_ATTRIBUTE.damageVolley) * quantity,
  };
}

/** One Offense row per key: drone-ness, type and charge. */
export function weaponRowKey(row: Pick<WeaponRow, 'isDrone' | 'typeId' | 'chargeTypeId'>): string {
  return `${row.isDrone ? 'drone' : 'module'}:${row.typeId}:${row.chargeTypeId ?? ''}`;
}

/**
 * Offense rows, total = sum of rows. `items`, `results` and
 * `overheatedResults` (null when nothing could overheat) are index-parallel.
 * Firing uses the engine's reached state, since non-firing weapons still report a volley.
 */
export function extractOffense(
  items: readonly OffenseItem[],
  results: readonly ModuleCalculationResult[],
  overheatedResults: readonly ModuleCalculationResult[] | null
): OffenseStats {
  const rows = new Map<string, WeaponRow>();
  items.forEach((item, index) => {
    const result = results[index];
    if (!result || !isFiring(result.state)) return;
    const figures = damageFigures(result.attributes, item.quantity);
    if (figures.dps === 0 && figures.volley === 0) return;

    const heated =
      !item.isDrone && result.max_state === 'overload' ? overheatedResults?.[index] : undefined;
    const key = weaponRowKey(item);
    let row = rows.get(key);
    if (!row) {
      row = {
        typeId: item.typeId,
        chargeTypeId: item.chargeTypeId,
        isDrone: item.isDrone,
        count: 0,
        dps: 0,
        volley: 0,
        overheated: heated ? { dps: 0, volley: 0 } : null,
      };
      rows.set(key, row);
    }
    row.count += item.quantity;
    row.dps += figures.dps;
    row.volley += figures.volley;
    if (heated && row.overheated) {
      const heatedFigures = damageFigures(heated.attributes, item.quantity);
      row.overheated.dps += heatedFigures.dps;
      row.overheated.volley += heatedFigures.volley;
    }
  });

  const weapons = [...rows.values()];
  const sum = (value: (row: WeaponRow) => number) =>
    weapons.reduce((total, row) => total + value(row), 0);
  const canOverheat = weapons.some((row) => row.overheated !== null);
  return {
    weapons,
    dps: sum((row) => row.dps),
    volley: sum((row) => row.volley),
    overheated: canOverheat
      ? {
          dps: sum((row) => row.overheated?.dps ?? row.dps),
          volley: sum((row) => row.overheated?.volley ?? row.volley),
        }
      : null,
  };
}

/** The overheated stats other than Offense, off the engine's overloaded recalculation. */
export function extractOverheatedStats(shipAttributes: AttributeMap): OverheatedStats {
  return {
    ehp: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.ehp),
    maxVelocity: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.maxVelocity),
    repair: localRepair(shipAttributes),
    ...defenseLayers(shipAttributes),
  };
}

/**
 * The overheated value to show beside a normal one, or null when there is
 * none or it would read the same at the displayed precision — so a section
 * no overheatable module touches shows no overheated line.
 */
export function overheatedOrNull(
  normal: number,
  overheated: number | null | undefined,
  fractionDigits: number
): number | null {
  if (overheated === null || overheated === undefined) return null;
  return overheated.toFixed(fractionDigits) === normal.toFixed(fractionDigits) ? null : overheated;
}

/**
 * Seconds to align for warp from a standstill — the game's own formula,
 * ln(4) × inertia modifier × mass (kg) / 1,000,000: the time to reach 75% of
 * top speed, which is when warp engages.
 */
export function alignTimeSeconds(massKg: number, agility: number): number {
  return (Math.log(4) * agility * massKg) / 1_000_000;
}

/**
 * Whether the editor shows drones at all: a hull with no drone bay and no
 * bandwidth (a Corax) has nothing to put them in. Drones already in the
 * Fitting (a pasted fit) keep it showing, so they can be removed; before the
 * ship data, only those do.
 */
export function showsDrones(
  stats: Pick<FittingStats, 'droneCapacity' | 'droneBandwidthTotal'> | null,
  fittedDrones: number
): boolean {
  if (fittedDrones > 0) return true;
  return stats !== null && (stats.droneCapacity > 0 || stats.droneBandwidthTotal > 0);
}
