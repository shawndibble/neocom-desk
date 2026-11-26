import { classifyFitCurrency, type FitCurrency, type HullSlotCounts } from './fitCurrency';
import { loadEftFitting, type EftSlotLookup, type EftTypeLookup } from './eftLoader';
import { fittingItemCounts } from './fittingExport';
import type { ItemCount } from './fitSellPrice';
import type { LoadParts } from './load';
import { popularFitKey } from './popularFits';
import { fittingRequirementTypeIds } from './skillGaps';
import type { RackModule } from './types';

export interface WorkbenchGameData {
  typeByName: EftTypeLookup;
  slotByTypeId: EftSlotLookup;
  hullSlots: (shipTypeId: number) => HullSlotCounts | null;
  isGameItem: (name: string) => boolean;
}

export interface WorkbenchFitCheck {
  verdict: FitCurrency;
  hullTypeId: number | null;
  modules: readonly RackModule[];
  items: readonly ItemCount[];
  requirementTypeIds: readonly number[];
  sightingKey: string | null;
}

function modulesAreWhole(parts: LoadParts, isGameItem: (name: string) => boolean): boolean {
  return parts.unresolved.every(
    (warning) =>
      warning.kind === 'unknown-item' && warning.countWritten === true && isGameItem(warning.text)
  );
}

export function checkWorkbenchFit(eft: string, data: WorkbenchGameData): WorkbenchFitCheck {
  const parts = loadEftFitting(eft, data.typeByName, data.slotByTypeId);
  const hullTypeId = parts.hullTypeId;
  const verdict = classifyFitCurrency(
    parts,
    hullTypeId === null ? null : data.hullSlots(hullTypeId),
    data.isGameItem
  );
  if (hullTypeId === null) {
    return {
      verdict,
      hullTypeId,
      modules: [],
      items: [],
      requirementTypeIds: [],
      sightingKey: null,
    };
  }
  return {
    verdict,
    hullTypeId,
    modules: parts.modules.map(({ slot, typeId }) => ({ slot, typeId })),
    items: [
      ...fittingItemCounts({
        name: '',
        shipTypeId: hullTypeId,
        modules: parts.modules,
        drones: parts.drones,
        cargo: parts.cargo,
        fighters: parts.fighters,
      }),
    ],
    requirementTypeIds: fittingRequirementTypeIds({ shipTypeId: hullTypeId, ...parts }),
    sightingKey: modulesAreWhole(parts, data.isGameItem) ? popularFitKey(parts.modules) : null,
  };
}
