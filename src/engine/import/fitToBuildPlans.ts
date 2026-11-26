import { MAX_JOB_RUNS } from '../industry/types';
import type { EftFit, EftItem } from './eftFit';

export interface FitBlueprintResolution {
  blueprintTypeID: number;
  productTypeID: number;
  productName: string;
  unitsPerRun: number;
}

export type FitBlueprintLookup = (itemName: string) => FitBlueprintResolution | null;

export interface FitBuildCandidate {
  blueprintTypeID: number;
  productTypeID: number;
  productName: string;
  quantity: number;
  runs: number;
  spare: number;
}

export interface FitSkippedItem {
  name: string;
  quantity: number;
}

export interface FitToBuildPlansResult {
  hull: FitBuildCandidate | null;
  items: FitBuildCandidate[];
  skipped: FitSkippedItem[];
  excludedCharges: FitSkippedItem[];
  groupName: string | null;
  headerFailed: boolean;
}

export interface FitToBuildPlansOptions {
  includeCharges?: boolean;
}

function runsFor(quantity: number, unitsPerRun: number): number {
  const perRun = unitsPerRun > 0 ? unitsPerRun : 1;
  return Math.min(MAX_JOB_RUNS, Math.max(1, Math.ceil(quantity / perRun)));
}

function candidateFor(resolution: FitBlueprintResolution, quantity: number): FitBuildCandidate {
  const runs = runsFor(quantity, resolution.unitsPerRun);
  const perRun = resolution.unitsPerRun > 0 ? resolution.unitsPerRun : 1;
  return {
    blueprintTypeID: resolution.blueprintTypeID,
    productTypeID: resolution.productTypeID,
    productName: resolution.productName,
    quantity,
    runs,
    spare: Math.max(0, runs * perRun - quantity),
  };
}

export function fitToBuildPlans(
  fit: EftFit,
  lookup: FitBlueprintLookup,
  { includeCharges = false }: FitToBuildPlansOptions = {}
): FitToBuildPlansResult {
  const headerFailed = fit.shipName === '';

  const resolved = new Map<number, { resolution: FitBlueprintResolution; quantity: number }>();
  const order: number[] = [];
  const skipped = new Map<string, FitSkippedItem>();
  const excludedCharges = new Map<string, FitSkippedItem>();

  function addSkipped(into: Map<string, FitSkippedItem>, item: EftItem) {
    const key = item.name.toLowerCase();
    const existing = into.get(key);
    if (existing) existing.quantity += item.quantity;
    else into.set(key, { name: item.name, quantity: item.quantity });
  }

  function addResolved(resolution: FitBlueprintResolution, quantity: number) {
    const existing = resolved.get(resolution.blueprintTypeID);
    if (existing) {
      existing.quantity += quantity;
      return;
    }
    resolved.set(resolution.blueprintTypeID, { resolution, quantity });
    order.push(resolution.blueprintTypeID);
  }

  for (const item of fit.items) {
    if (item.isCharge && !includeCharges) {
      addSkipped(excludedCharges, item);
      continue;
    }
    const resolution = lookup(item.name);
    if (!resolution) {
      addSkipped(skipped, item);
      continue;
    }
    addResolved(resolution, item.isCharge ? resolution.unitsPerRun : item.quantity);
  }

  const hullResolution = headerFailed ? null : lookup(fit.shipName);
  if (!headerFailed && !hullResolution) {
    addSkipped(skipped, { name: fit.shipName, quantity: 1, line: fit.headerLine });
  }

  return {
    hull: hullResolution ? candidateFor(hullResolution, 1) : null,
    items: order.flatMap((id) => {
      const entry = resolved.get(id);
      return entry ? [candidateFor(entry.resolution, entry.quantity)] : [];
    }),
    skipped: [...skipped.values()],
    excludedCharges: [...excludedCharges.values()],
    groupName: headerFailed || fit.fitName === '' ? null : fit.fitName,
    headerFailed,
  };
}
