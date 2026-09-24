import { DOGMA_ATTRIBUTE, type CapacitorStatus, type FittingStats } from './types';

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
 */
export function extractFittingStats(
  itemTypeIds: readonly number[],
  shipAttributes: AttributeMap,
  itemResults: readonly ItemCalculationResult[]
): FittingStats {
  const cpuTotal = readAttribute(shipAttributes, DOGMA_ATTRIBUTE.cpuOutput);
  const powergridTotal = readAttribute(shipAttributes, DOGMA_ATTRIBUTE.powerOutput);

  return {
    cpuTotal,
    cpuUsed: cpuTotal - readAttribute(shipAttributes, DOGMA_ATTRIBUTE.cpuFree),
    powergridTotal,
    powergridUsed: powergridTotal - readAttribute(shipAttributes, DOGMA_ATTRIBUTE.powerFree),
    droneDps: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.droneDamagePerSecond),
    ehp: readAttribute(shipAttributes, DOGMA_ATTRIBUTE.ehp),
    capacitor: capacitorStatus(shipAttributes),
    unknownItemTypeIds: itemTypeIds.filter((_, index) => isUnknownItem(itemResults[index])),
  };
}
