import {
  CHARGE_GROUP_ATTRIBUTES,
  DOGMA_ATTRIBUTE,
  ITEM_DOGMA_ATTRIBUTE,
  type CapacitorStatus,
  type FittingItemState,
  type FittingModuleResult,
  type FittingStats,
  type LayerDefense,
  type LocalRepair,
  type OffenseStats,
  type OverheatedStats,
  type WeaponRow,
} from './types';

interface AttributeMap {
  get(attributeId: number): { value: number } | undefined;
}

interface ItemCalculationResult {
  attributes: { size: number };
}

function readAttribute(attributes: AttributeMap, attributeId: number): number {
  return attributes.get(attributeId)?.value ?? 0;
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

function layerDefense(
  shipAttributes: AttributeMap,
  hpAttr: number,
  emAttr: number,
  thermalAttr: number,
  kineticAttr: number,
  explosiveAttr: number
): LayerDefense {
  return {
    hp: readAttribute(shipAttributes, hpAttr),
    emResonance: readAttribute(shipAttributes, emAttr),
    thermalResonance: readAttribute(shipAttributes, thermalAttr),
    kineticResonance: readAttribute(shipAttributes, kineticAttr),
    explosiveResonance: readAttribute(shipAttributes, explosiveAttr),
  };
}

/**
 * A type id the pinned `sde.dat` has nothing for comes back from `calculate`
 * with an empty attribute map rather than failing the whole calculation
 * (verified against a live run of the pinned engine, 2026-09-24) — that's how
 * this seam tells an unresolvable item apart from a genuinely inert one,
 * which still carries its base SDE attributes.
 */
function isUnknownItem(result: ItemCalculationResult): boolean {
  return result.attributes.size === 0;
}

/**
 * Reads the stats this ticket's fitting stats card needs off a calculation
 * (ADR 0016's seam). `itemTypeIds`/`itemResults` must be the same
 * index-parallel arrays `calculate()` was given and returned.
 *
 * Leaves out `calibrationUsed`/`droneBandwidthUsed`: unlike everything here,
 * those are summed from *item*-level attributes on whichever items actually
 * draw them (rigs; active/online drones) rather than read off one ship-level
 * id — `dogmaFittingEngine.ts` computes and adds them, since only it also
 * has `dogmaFit.items`' slot types to know which items those are.
 */
export function extractFittingStats(
  itemTypeIds: readonly number[],
  shipAttributes: AttributeMap,
  itemResults: readonly ItemCalculationResult[]
): Omit<
  FittingStats,
  'calibrationUsed' | 'droneBandwidthUsed' | 'modules' | 'offense' | 'overheated'
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
    shield: layerDefense(
      shipAttributes,
      DOGMA_ATTRIBUTE.shieldCapacity,
      DOGMA_ATTRIBUTE.shieldEmResonance,
      DOGMA_ATTRIBUTE.shieldThermalResonance,
      DOGMA_ATTRIBUTE.shieldKineticResonance,
      DOGMA_ATTRIBUTE.shieldExplosiveResonance
    ),
    armor: layerDefense(
      shipAttributes,
      DOGMA_ATTRIBUTE.armorHp,
      DOGMA_ATTRIBUTE.armorEmResonance,
      DOGMA_ATTRIBUTE.armorThermalResonance,
      DOGMA_ATTRIBUTE.armorKineticResonance,
      DOGMA_ATTRIBUTE.armorExplosiveResonance
    ),
    hull: layerDefense(
      shipAttributes,
      DOGMA_ATTRIBUTE.hullHp,
      DOGMA_ATTRIBUTE.hullEmResonance,
      DOGMA_ATTRIBUTE.hullThermalResonance,
      DOGMA_ATTRIBUTE.hullKineticResonance,
      DOGMA_ATTRIBUTE.hullExplosiveResonance
    ),
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
    unknownItemTypeIds: itemTypeIds.filter((_, index) => isUnknownItem(itemResults[index])),
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

/** One fitted module's calculation, as the editor's state and charge controls need it. */
export function extractModuleResult(result: ModuleCalculationResult): FittingModuleResult {
  return {
    state: result.state,
    maxState: result.max_state,
    chargeGroupIds: CHARGE_GROUP_ATTRIBUTES.map((id) =>
      readAttribute(result.attributes, id)
    ).filter((groupId) => groupId > 0),
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

/**
 * The Offense section: one row per weapon (grouped by type and charge) or
 * drone type, with the total as the sum of the rows. `items`/`results` (and
 * `overheatedResults`, the engine's recalculation with every heatable active
 * module overloaded — null when there was none) are index-parallel.
 *
 * Firing is read off the engine's reached state, not the requested one: an
 * online launcher still reports a volley, and the engine counts a drone
 * stack as engaged whatever state it was given — so do the rows, keeping
 * them in step with the ship-level drone DPS.
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
    const dps = readAttribute(result.attributes, ITEM_DOGMA_ATTRIBUTE.damagePerSecond);
    const volley = readAttribute(result.attributes, ITEM_DOGMA_ATTRIBUTE.damageVolley);
    if (dps === 0 && volley === 0) return;

    const heated =
      !item.isDrone && result.max_state === 'overload' ? overheatedResults?.[index] : undefined;
    const key = `${item.isDrone}:${item.typeId}:${item.chargeTypeId ?? ''}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        typeId: item.typeId,
        chargeTypeId: item.chargeTypeId,
        isDrone: item.isDrone,
        count: 0,
        dps: 0,
        volley: 0,
        overheatedDps: heated ? 0 : null,
        overheatedVolley: heated ? 0 : null,
      };
      rows.set(key, row);
    }
    row.count += item.quantity;
    row.dps += dps * item.quantity;
    row.volley += volley * item.quantity;
    if (heated && row.overheatedDps !== null && row.overheatedVolley !== null) {
      row.overheatedDps +=
        readAttribute(heated.attributes, ITEM_DOGMA_ATTRIBUTE.damagePerSecond) * item.quantity;
      row.overheatedVolley +=
        readAttribute(heated.attributes, ITEM_DOGMA_ATTRIBUTE.damageVolley) * item.quantity;
    }
  });

  const weapons = [...rows.values()];
  const sum = (value: (row: WeaponRow) => number) =>
    weapons.reduce((total, row) => total + value(row), 0);
  const canOverheat = weapons.some((row) => row.overheatedDps !== null);
  return {
    weapons,
    dps: sum((row) => row.dps),
    volley: sum((row) => row.volley),
    overheatedDps: canOverheat ? sum((row) => row.overheatedDps ?? row.dps) : null,
    overheatedVolley: canOverheat ? sum((row) => row.overheatedVolley ?? row.volley) : null,
  };
}

/** The overheated stats other than Offense, off the engine's overloaded recalculation. */
export function extractOverheatedStats(shipAttributes: AttributeMap): OverheatedStats {
  return {
    ehp: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.ehp),
    maxVelocity: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.maxVelocity),
    repair: localRepair(shipAttributes),
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
