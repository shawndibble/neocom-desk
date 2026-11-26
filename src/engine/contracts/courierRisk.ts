import { isGankChokepoint } from '../route/chokepoints';
import type { CourierRouteRow, CourierEndpoint } from './courierSearch';
import { HOUR_MS } from '@/lib/age';

export type CourierRiskKind =
  | 'player-structure'
  | 'no-gate-route'
  | 'nullsec'
  | 'over-rate'
  | 'gank-chokepoint'
  | 'high-collateral';

export function isWormholeRegion(regionId: number | null): boolean {
  return regionId !== null && regionId >= 11_000_000 && regionId < 12_000_000;
}

function unreachableByGates(endpoint: CourierEndpoint): boolean {
  return endpoint.hasStargates === false || isWormholeRegion(endpoint.regionId);
}

export function endpointRisks(
  endpoint: CourierEndpoint,
  end: 'origin' | 'destination'
): CourierRiskKind[] {
  const risks: CourierRiskKind[] = [];
  if (end === 'destination' && endpoint.resolution === 'structure') {
    risks.push('player-structure');
  }
  if (unreachableByGates(endpoint)) {
    risks.push('no-gate-route');
    return risks;
  }
  if (isGankChokepoint(endpoint.systemId)) risks.push('gank-chokepoint');
  if (endpoint.space === 'nullsec') risks.push('nullsec');
  return risks;
}

export function courierRisks(row: CourierRouteRow): CourierRiskKind[] {
  const both = new Set([
    ...endpointRisks(row.origin, 'origin'),
    ...endpointRisks(row.destination, 'destination'),
  ]);
  return RISK_ORDER.filter((kind) => both.has(kind));
}

const RISK_ORDER: readonly CourierRiskKind[] = [
  'player-structure',
  'no-gate-route',
  'gank-chokepoint',
  'nullsec',
];

export function blocksCompletion(risks: readonly CourierRiskKind[]): boolean {
  return risks.some((risk) => risk === 'player-structure' || risk === 'no-gate-route');
}

export function completableCourierRoutes(rows: readonly CourierRouteRow[]): CourierRouteRow[] {
  return rows.filter((row) => !blocksCompletion(courierRisks(row)));
}

export const HIGH_COLLATERAL_RATIO = 50;

export function asksFarMoreCollateralThanReward(
  ratio: number | null,
  threshold: number = HIGH_COLLATERAL_RATIO
): boolean {
  return ratio !== null && ratio >= threshold;
}

export const FREIGHTER_VOLUME_M3 = 350_000;

export function forcesFreighter(volume: number): boolean {
  return volume > FREIGHTER_VOLUME_M3;
}

export function hoursToExpiry(dateExpired: number, now: number): number {
  return Math.max(0, Math.floor((dateExpired - now) / HOUR_MS));
}
