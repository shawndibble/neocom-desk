import { priceOnBasis, type AppraisalRow, type RefineBasis } from '../appraisal';

export interface AsIsFigures {
  each: number | null;
  total: number | null;
}

export type RefineVerdict = 'refine' | 'sellAsIs' | null;

export interface RefineFigures {
  minerals: number | undefined;
  withLeftover: number | undefined;
  pricedAll: boolean | undefined;
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
