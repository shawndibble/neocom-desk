/**
 * One Appraisal row's refine-versus-sell-as-is figures on one Price Basis.
 * Internal to `appraisalRowFigures`: callers read `rowFigures(...).refine` and
 * `.asIs`, never these.
 */
import { priceOnBasis, type AppraisalRow, type RefineBasis } from '../appraisal';

/** What the whole pasted quantity fetches sold as is, and one unit of it, on a basis. */
export interface AsIsFigures {
  /** One unit's as-is price, which also prices the leftover units; null where a side the basis needs has no price. */
  each: number | null;
  /** The whole pasted quantity sold as is; null where a side the basis needs has no price. */
  total: number | null;
}

/**
 * Which way the row should go on the basis: refining wins, selling as is wins,
 * or there is no refine figure to compare (null).
 */
export type RefineVerdict = 'refine' | 'sellAsIs' | null;

export interface RefineFigures {
  /**
   * What refining yields in minerals, net of tax, with the leftover units left
   * out: the figure the Refine total column and chip show. Undefined where the
   * row has no reprocessing data, or the basis needs a side never read. A split
   * is only given where both sides priced every mineral, so a mineral nobody
   * trades on one side is never counted at half its other price.
   */
  minerals: number | undefined;
  /**
   * The minerals **plus** the units too few to fill a portion, which stay yours
   * and sell as is at the basis's unit price: what the verdict compares, and the
   * Refine + ore column. A leftover with no as-is price counts for nothing
   * rather than for a guess. Undefined wherever `minerals` is.
   */
  withLeftover: number | undefined;
  /** False where a mineral had no price on the basis, so the figure is a floor. */
  pricedAll: boolean | undefined;
  /**
   * Refine against sell as is (issue #1048): `withLeftover` against the as-is
   * total, both on the basis and already scaled by Price Percent. Strictly
   * greater, because a tie is not a win: below one whole batch nothing
   * refines, the leftover is the whole paste and both paths come to the same
   * ISK, which must read as sell. A row with a refine figure but no as-is price
   * on the basis is not a refine win either: an unpriced leftover is never
   * silently free.
   */
  verdict: RefineVerdict;
}

export function asIsFigures(row: AppraisalRow, basis: RefineBasis): AsIsFigures {
  return {
    each: priceOnBasis(basis, row.buyEach, row.sellEach),
    total: priceOnBasis(basis, row.buyTotal, row.sellTotal),
  };
}

function mineralsOn(row: AppraisalRow, basis: RefineBasis): number | undefined {
  if (basis === 'split' && (row.refinePricedAll === false || row.refineSellPricedAll === false)) {
    return undefined;
  }
  return priceOnBasis(basis, row.refineTotal, row.refineSellTotal) ?? undefined;
}

function pricedAllOn(row: AppraisalRow, basis: RefineBasis): boolean | undefined {
  if (basis === 'buy') return row.refinePricedAll;
  if (basis === 'sell') return row.refineSellPricedAll;
  return row.refinePricedAll === undefined || row.refineSellPricedAll === undefined
    ? undefined
    : row.refinePricedAll && row.refineSellPricedAll;
}

export function refineFigures(
  row: AppraisalRow,
  basis: RefineBasis,
  asIs: AsIsFigures
): RefineFigures {
  const minerals = mineralsOn(row, basis);
  const withLeftover =
    minerals === undefined
      ? undefined
      : minerals + (row.refineUnitsLeftOver ?? 0) * (asIs.each ?? 0);
  const refineWins =
    withLeftover !== undefined &&
    asIs.total !== null &&
    asIs.each !== null &&
    withLeftover > asIs.total;
  return {
    minerals,
    withLeftover,
    pricedAll: pricedAllOn(row, basis),
    verdict: withLeftover === undefined ? null : refineWins ? 'refine' : 'sellAsIs',
  };
}
