import { median } from '@/engine/math';
import { MIN_COMPARABLE_OFFERS } from './belowMarket';
import { effectivePrice, iskPerRun, type BpcContractRow } from './bpcSearch';
import { percentDifference } from './contractPriceCheck';

export const SIMILAR_COPY_WINDOW = { me: 2, te: 4 } as const;

export interface BpcPerRunCheck {
  perRun: number;
  medianPerRun: number;
  cheapestPerRun: number;
  count: number;
  diff: number | null;
}

function perRunOf(row: BpcContractRow): number | null {
  return iskPerRun(effectivePrice(row), row.runs, row.quantity, row.isMultiType);
}

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

export function bpcPeerDiffs(
  pool: readonly BpcContractRow[]
): (row: BpcContractRow) => number | null {
  const byType = new Map<number, BpcContractRow[]>();
  for (const row of pool) {
    const group = byType.get(row.typeId);
    if (group) group.push(row);
    else byType.set(row.typeId, [row]);
  }
  const answers = new Map<number, number | null>();
  return (row) => {
    const known = answers.get(row.contractId);
    if (known !== undefined) return known;
    const diff = bpcPerRunCheck(row, byType.get(row.typeId) ?? [])?.diff ?? null;
    answers.set(row.contractId, diff);
    return diff;
  };
}
