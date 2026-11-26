import { brokerFeePct } from '@/engine/industry/fees';

const TAKE_REDUCTION_PER_STANDING = 0.15;

export function reprocessingTaxPct(stationTakePct: number, standing: number): number {
  const share = 1 - TAKE_REDUCTION_PER_STANDING * Math.max(0, standing);
  return stationTakePct * Math.max(0, share);
}

export interface BrokerFeeComparison {
  atZeroPct: number;
  atYoursPct: number;
  savingPct: number;
}

export function brokerFeeComparison(
  brokerRelationsLevel: number,
  baseFactionStanding: number,
  baseCorpStanding: number
): BrokerFeeComparison {
  const atZeroPct = brokerFeePct(brokerRelationsLevel, 0, 0);
  const atYoursPct = brokerFeePct(brokerRelationsLevel, baseFactionStanding, baseCorpStanding);
  return { atZeroPct, atYoursPct, savingPct: atZeroPct - atYoursPct };
}
