import { endpointRisks, type CourierRiskKind } from '@/engine/contracts/courierRisk';
import type { CourierEndpoint } from '@/engine/contracts/courierSearch';

export const MARKED_RISKS: readonly CourierRiskKind[] = [
  'player-structure',
  'no-gate-route',
  'over-rate',
  'gank-chokepoint',
];

export function markedEndpointRisks(
  endpoint: CourierEndpoint,
  end: 'origin' | 'destination'
): CourierRiskKind[] {
  return endpointRisks(endpoint, end).filter((kind) => MARKED_RISKS.includes(kind));
}

export const WARNING_RISKS: readonly CourierRiskKind[] = [...MARKED_RISKS, 'high-collateral'];

interface RiskCopy {
  short: string;
  detail: string;
}

export const RISK_COPY: Record<CourierRiskKind, RiskCopy> = {
  'player-structure': {
    short: 'contractSearch.risk.structureShort',
    detail: 'contractSearch.risk.structureDetail',
  },
  'no-gate-route': {
    short: 'contractSearch.risk.noGateRouteShort',
    detail: 'contractSearch.risk.noGateRouteDetail',
  },
  nullsec: {
    short: 'contractSearch.risk.nullsecShort',
    detail: 'contractSearch.risk.nullsecDetail',
  },
  'gank-chokepoint': {
    short: 'contractSearch.risk.chokepointShort',
    detail: 'contractSearch.risk.chokepointDetail',
  },
  'over-rate': {
    short: 'contractSearch.risk.overRateShort',
    detail: 'contractSearch.risk.overRateDetail',
  },
  'high-collateral': {
    short: 'contractSearch.risk.highCollateralShort',
    detail: 'contractSearch.risk.highCollateralDetail',
  },
};
