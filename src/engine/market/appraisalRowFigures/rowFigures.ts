import type { AppraisalNetFees, AppraisalRow, RefineBasis } from '../appraisal';
import { feeFigures, type FeeFigures } from './feeFigures';
import { asIsFigures, refineFigures, type AsIsFigures, type RefineFigures } from './refineFigures';

export { asIsFigures };

/** The figures that are the same on every Price Basis: the split price and the sell fees. */
export interface BasisFreeFigures {
  /** The midpoint of the buy-each and sell-each price; null unless both sides are priced. */
  splitEach: number | null;
  fees: FeeFigures;
}

/** Every derived figure one Appraisal row shows, on one Price Basis. */
export interface RowFigures extends BasisFreeFigures {
  basis: RefineBasis;
  asIs: AsIsFigures;
  refine: RefineFigures;
}

/** The pile's figures on one Price Basis. */
export interface PileFigures {
  /** The Refine chip: the minerals alone, summed over the rows that have a figure on the basis. */
  refineMinerals: number;
  /** At least one row has a refine figure on the basis, so the Refine columns and chip earn a place. */
  refinable: boolean;
}

/**
 * The split price and sell fees, for a view with no Price Basis in play (a
 * CSV's basis-free columns). `fees` null = the skills are not known yet, and
 * the fee figures are null.
 */
export function basisFreeFigures(
  row: AppraisalRow,
  fees: AppraisalNetFees | null
): BasisFreeFigures {
  return {
    splitEach:
      row.buyEach === null || row.sellEach === null ? null : (row.buyEach + row.sellEach) / 2,
    fees: feeFigures(row, fees),
  };
}

/**
 * The one record a table cell, a CSV column or a share view reads for a row.
 * The basis is the pilot's remembered Price Basis; there is no default, so a
 * caller can never quietly price on the buy side.
 */
export function rowFigures(
  row: AppraisalRow,
  basis: RefineBasis,
  fees: AppraisalNetFees | null
): RowFigures {
  const asIs = asIsFigures(row, basis);
  return { ...basisFreeFigures(row, fees), basis, asIs, refine: refineFigures(row, basis, asIs) };
}

export function pileFigures(rows: readonly AppraisalRow[], basis: RefineBasis): PileFigures {
  let refineMinerals = 0;
  let refinable = false;
  for (const row of rows) {
    const { minerals } = refineFigures(row, basis, asIsFigures(row, basis));
    if (minerals === undefined) continue;
    refinable = true;
    refineMinerals += minerals;
  }
  return { refineMinerals, refinable };
}
