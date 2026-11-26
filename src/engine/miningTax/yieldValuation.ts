import type { OreLine } from './types';
import {
  DEFAULT_REFINING_SETUP,
  netOfReprocessingTax,
  type RefiningSetup,
} from '@/engine/industry/refiningSetup';
import {
  reprocessingValue,
  reprocessingYield,
  type ReprocessingMaterial,
} from '@/engine/industry/reprocessing';
import {
  baselineRefiningEfficiency,
  refiningEfficiency,
  type CharacterModifiers,
} from '@/engine/industry/characterModifiers';

export interface YieldReprocessingEntry {
  portionSize: number;
  materials: readonly ReprocessingMaterial[];
  specialisationSkillId?: number;
}

export interface OreLineValuation {
  typeId: number;
  quantity: number;
  rawValue: number;
  refineValue: number;
  refineOutputs: ReprocessingMaterial[];
  batches: number;
  unitsLeftOver: number;
}

export interface EntryValuation {
  rawValue: number;
  refineValue: number;
  pricedAll: boolean;
  lines: OreLineValuation[];
  efficiency: number;
  implantBonusPct: number;
}

export interface ValueMiningYieldOptions {
  includeRefining?: boolean;
  refining?: RefiningSetup;
}

export function valueMiningYield(
  oreLines: readonly OreLine[],
  rawUnitPrices: ReadonlyMap<number, number>,
  reprocessingByTypeId: ReadonlyMap<number, YieldReprocessingEntry | undefined>,
  modifiers: CharacterModifiers,
  materialPrices: Readonly<Record<number, number>>,
  { includeRefining = true, refining = DEFAULT_REFINING_SETUP }: ValueMiningYieldOptions = {}
): EntryValuation {
  const efficiency = baselineRefiningEfficiency(modifiers, refining.stationRate);
  let rawValue = 0;
  let refineValue = 0;
  let pricedAll = true;
  const lines: OreLineValuation[] = [];

  for (const line of oreLines) {
    const rawPrice = rawUnitPrices.get(line.typeId);
    const lineRawValue = rawPrice !== undefined && rawPrice > 0 ? rawPrice * line.quantity : 0;
    if (lineRawValue === 0) pricedAll = false;
    rawValue += lineRawValue;

    const reprocessing = includeRefining ? reprocessingByTypeId.get(line.typeId) : undefined;
    let lineRefineValue = 0;
    let refineOutputs: ReprocessingMaterial[] = [];
    let batches = 0;
    let unitsLeftOver = 0;
    if (reprocessing) {
      const lineEfficiency = refiningEfficiency(
        modifiers,
        reprocessing.specialisationSkillId,
        refining.stationRate
      );
      const yielded = reprocessingYield({
        portionSize: reprocessing.portionSize,
        materials: reprocessing.materials,
        units: line.quantity,
        efficiency: lineEfficiency,
      });
      const value = reprocessingValue(yielded.outputs, materialPrices);
      lineRefineValue = netOfReprocessingTax(value.total, refining.taxRate);
      refineOutputs = yielded.outputs;
      batches = yielded.batches;
      unitsLeftOver = yielded.unitsLeftOver;
      if (!value.pricedAll) pricedAll = false;
    } else if (includeRefining) {
      pricedAll = false;
    }
    refineValue += lineRefineValue;

    lines.push({
      typeId: line.typeId,
      quantity: line.quantity,
      rawValue: lineRawValue,
      refineValue: lineRefineValue,
      refineOutputs,
      batches,
      unitsLeftOver,
    });
  }

  return {
    rawValue,
    refineValue,
    pricedAll,
    lines,
    efficiency,
    implantBonusPct: modifiers.refiningImplantPct,
  };
}

export function nothingPriced(valuation: EntryValuation): boolean {
  return !valuation.pricedAll && valuation.rawValue === 0 && valuation.refineValue === 0;
}
