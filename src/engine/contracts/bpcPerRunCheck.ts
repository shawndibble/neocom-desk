/**
 * BPC Sourcing's fairness check: a blueprint copy has no market price, so a
 * listing is held against other copies of the same blueprint, per run. Pure —
 * the caller passes the rows (BPC Sourcing's, or the Public Contract Offers
 * snapshot narrowed to copies).
 *
 * "Similar" means the same blueprint with ME and TE close to this copy's: a
 * ME 10 copy is not priced like a ME 0 one. Per run, not per contract, so a
 * 5-run and a 10-run copy compare on equal footing (`iskPerRun`).
 */
import { median } from '@/engine/math';
import { MIN_COMPARABLE_OFFERS } from './belowMarket';
import { effectivePrice, iskPerRun, type BpcContractRow } from './bpcSearch';
import { percentDifference } from './contractPriceCheck';

/** How far a copy's ME and TE may sit from this one's and still count as similar. */
export const SIMILAR_COPY_WINDOW = { me: 2, te: 4 } as const;

export interface BpcPerRunCheck {
  /** This listing's ISK per run. */
  perRun: number;
  medianPerRun: number;
  cheapestPerRun: number;
  /** Similar copies behind the median and cheapest. */
  count: number;
  /** Percent this listing's per-run rate sits from the median. */
  diff: number | null;
}

function perRunOf(row: BpcContractRow): number | null {
  return iskPerRun(effectivePrice(row), row.runs, row.quantity, row.isMultiType);
}

/**
 * `null` when this listing has no per-run rate (a bundle, a barter, zero
 * runs), or when fewer than `MIN_COMPARABLE_OFFERS` similar copies exist:
 * the panel then says there is nothing to compare with, not a median of two.
 */
export function bpcPerRunCheck(
  row: BpcContractRow,
  candidates: readonly BpcContractRow[]
): BpcPerRunCheck | null {
  const perRun = perRunOf(row);
  if (perRun === null) return null;
  const rates: number[] = [];
  for (const other of candidates) {
    if (other.contractId === row.contractId || other.typeId !== row.typeId) continue;
    if (Math.abs(other.me - row.me) > SIMILAR_COPY_WINDOW.me) continue;
    if (Math.abs(other.te - row.te) > SIMILAR_COPY_WINDOW.te) continue;
    const rate = perRunOf(other);
    if (rate !== null) rates.push(rate);
  }
  if (rates.length < MIN_COMPARABLE_OFFERS) return null;
  const medianPerRun = median(rates);
  return {
    perRun,
    medianPerRun,
    cheapestPerRun: Math.min(...rates),
    count: rates.length,
    diff: percentDifference(perRun, medianPerRun),
  };
}
