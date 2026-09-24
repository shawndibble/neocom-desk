import {
  DOGMA_ATTRIBUTE,
  type CapacitorStatus,
  type FittingStats,
  type LayerDefense,
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
): Omit<FittingStats, 'calibrationUsed' | 'droneBandwidthUsed'> {
  const cpuTotal = readAttribute(shipAttributes, DOGMA_ATTRIBUTE.cpuOutput);
  const powergridTotal = readAttribute(shipAttributes, DOGMA_ATTRIBUTE.powerOutput);

  return {
    cpuTotal,
    cpuUsed: cpuTotal - readAttribute(shipAttributes, DOGMA_ATTRIBUTE.cpuFree),
    powergridTotal,
    powergridUsed: powergridTotal - readAttribute(shipAttributes, DOGMA_ATTRIBUTE.powerFree),
    calibrationTotal: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.calibration),
    slotLayout: {
      high: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.hiSlots),
      medium: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.medSlots),
      low: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.lowSlots),
      rig: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.rigSlots),
      subsystem: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.subsystemSlots),
    },
    droneDps: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.droneDamagePerSecond),
    droneBandwidthTotal: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.droneBandwidth),
    droneCapacity: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.droneCapacity),
    ehp: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.ehp),
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
  };
}
