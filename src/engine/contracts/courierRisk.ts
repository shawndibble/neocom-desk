/**
 * What might stop a courier haul being delivered (issue #944).
 *
 * A courier contract is accepted by putting up collateral. If the hauler then
 * cannot reach or dock at the delivery point, the contract expires undelivered
 * and the issuer keeps that collateral — a known, deliberate scam pattern, and
 * one that is invisible on a table where an unfinishable job looks exactly like
 * a finishable one. The unfinishable ones tend to pay conspicuously well, which
 * is what puts them at the top of a board ranked on ISK/jump.
 *
 * **Every flag states a condition and its consequence, never a verdict about
 * this player.** The app cannot read a structure's access list, and probing one
 * per row is exactly the ESI fan-out the local-snapshot approach exists to
 * avoid. So "docking rights are not guaranteed", never "you cannot dock".
 *
 * Pure, and derived entirely from fields the endpoints already carry.
 */
import type { CourierRouteRow, CourierEndpoint } from './courierSearch';

export type CourierRiskKind = 'player-structure' | 'no-gate-route' | 'nullsec';

/**
 * Every J-space system sits in a region numbered from 11000001 up, and the
 * contract row carries its own region natively. That matters because a
 * wormhole endpoint is always a player structure — `stations.json` holds no
 * NPC station in any J-named system — so the endpoint itself carries no
 * system, no band and no gate count to judge. The region id is the one local
 * fact that survives.
 */
export function isWormholeRegion(regionId: number | null): boolean {
  return regionId !== null && regionId >= 11_000_000;
}

/** No stargate reaches this end — a statement about New Eden, not about our data. */
function unreachableByGates(endpoint: CourierEndpoint): boolean {
  return endpoint.hasStargates === false || isWormholeRegion(endpoint.regionId);
}

/**
 * What one end of a haul carries — the same predicates the row-level list is
 * built from, so a marker rendered beside an endpoint and the sentence in the
 * detail modal can never disagree about which end is at issue.
 *
 * `player-structure` is a delivery-only conclusion: a pickup that cannot be
 * reached is simply never accepted, while a delivery is already paid for with
 * collateral put up.
 */
export function endpointRisks(
  endpoint: CourierEndpoint,
  end: 'origin' | 'destination'
): CourierRiskKind[] {
  const risks: CourierRiskKind[] = [];
  if (end === 'destination' && endpoint.resolution === 'structure') {
    risks.push('player-structure');
  }
  if (unreachableByGates(endpoint)) risks.push('no-gate-route');
  if (endpoint.space === 'nullsec') risks.push('nullsec');
  return risks;
}

/**
 * Every condition the haul carries, either end, in a fixed order: what could
 * cost the collateral, then what could cost the trip, then what is merely worth
 * knowing.
 */
export function courierRisks(row: CourierRouteRow): CourierRiskKind[] {
  const both = new Set([
    ...endpointRisks(row.origin, 'origin'),
    ...endpointRisks(row.destination, 'destination'),
  ]);
  return RISK_ORDER.filter((kind) => both.has(kind));
}

const RISK_ORDER: readonly CourierRiskKind[] = ['player-structure', 'no-gate-route', 'nullsec'];

/**
 * Which risks can stop a haul being delivered at all, and so are the ones a
 * "hide what I may not be able to complete" control removes.
 *
 * Nullsec is deliberately not among them. Plenty of nullsec hauling is
 * ordinary well-paid work, and hiding it behind a safety control would quietly
 * remove a real market rather than protect anyone.
 */
export function blocksCompletion(risks: readonly CourierRiskKind[]): boolean {
  return risks.some((risk) => risk === 'player-structure' || risk === 'no-gate-route');
}

/**
 * The rows a "hide hauls I may not be able to complete" control leaves on
 * screen. Kept beside the flags rather than in `filterCourierContracts`, so the
 * one place that decides what a risk *is* also decides what hiding one means —
 * the two cannot drift into disagreeing about which rows a flag covers.
 */
export function completableCourierRoutes(rows: readonly CourierRouteRow[]): CourierRouteRow[] {
  return rows.filter((row) => !blocksCompletion(courierRisks(row)));
}
