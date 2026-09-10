import type { OreLine } from './types';
import {
  reprocessingEfficiency,
  reprocessingValue,
  reprocessingYield,
  type ReprocessingMaterial,
  type ReprocessingSkills,
} from '@/engine/industry/reprocessing';

/** One type's reprocessing yield, resolved from the SDE bake — same shape `appraisal.ts` uses. */
export interface YieldReprocessingEntry {
  portionSize: number;
  materials: readonly ReprocessingMaterial[];
}

/** One ore line's raw and refine-then-sell value, both priced at the entry's mined date. */
export interface OreLineValuation {
  typeId: number;
  quantity: number;
  /** 0 when `rawUnitPrices` had no price for this type on the mined date. */
  rawValue: number;
  /** 0 when the type has no reprocessing data, or its yield had no priced material. */
  refineValue: number;
}

export interface EntryValuation {
  rawValue: number;
  refineValue: number;
  /**
   * False when any line lacked a mined-date raw price, carried no
   * reprocessing data at all, or reprocessed into at least one unpriced
   * material — the "Full"/"Partial" badge the Overview table shows per row.
   * Never a fabricated total: a missing price contributes zero, it does not
   * fail the whole entry.
   */
  pricedAll: boolean;
  lines: OreLineValuation[];
}

/**
 * Values a Mining Yield entry's ore lines two ways, both priced at the
 * entry's own mined date rather than today's price (issue #671): what
 * selling the raw ore nets, and what reprocessing it with the character's
 * skills and then selling the minerals nets — the same raw-vs-refine
 * comparison `computeAppraisalRefine` (issue #672) already established for
 * pasted items, applied here to mined output.
 *
 * `rawUnitPrices` and `materialPrices` are both mined-date prices the caller
 * resolves from market history; a type or material missing from either map
 * contributes zero to that side's value and flips `pricedAll` false, rather
 * than throwing or silently treating the ore as worthless in the total.
 */
export function valueMiningYield(
  oreLines: readonly OreLine[],
  rawUnitPrices: ReadonlyMap<number, number>,
  reprocessingByTypeId: ReadonlyMap<number, YieldReprocessingEntry | undefined>,
  skills: ReprocessingSkills,
  materialPrices: Readonly<Record<number, number>>
): EntryValuation {
  const efficiency = reprocessingEfficiency(skills);
  let rawValue = 0;
  let refineValue = 0;
  let pricedAll = true;
  const lines: OreLineValuation[] = [];

  for (const line of oreLines) {
    const rawPrice = rawUnitPrices.get(line.typeId);
    const lineRawValue = rawPrice !== undefined && rawPrice > 0 ? rawPrice * line.quantity : 0;
    if (lineRawValue === 0) pricedAll = false;
    rawValue += lineRawValue;

    const reprocessing = reprocessingByTypeId.get(line.typeId);
    let lineRefineValue = 0;
    if (reprocessing) {
      const yielded = reprocessingYield({
        portionSize: reprocessing.portionSize,
        materials: reprocessing.materials,
        units: line.quantity,
        efficiency,
      });
      const value = reprocessingValue(yielded.outputs, materialPrices);
      lineRefineValue = value.total;
      if (!value.pricedAll) pricedAll = false;
    } else {
      pricedAll = false;
    }
    refineValue += lineRefineValue;

    lines.push({
      typeId: line.typeId,
      quantity: line.quantity,
      rawValue: lineRawValue,
      refineValue: lineRefineValue,
    });
  }

  return { rawValue, refineValue, pricedAll, lines };
}
