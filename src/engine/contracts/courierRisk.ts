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
import { isGankChokepoint } from '../route/chokepoints';
import type { CourierRouteRow, CourierEndpoint } from './courierSearch';

export type CourierRiskKind =
  | 'player-structure'
  | 'no-gate-route'
  | 'nullsec'
  /**
   * Pays far above what the market pays for a haul this size over this
   * distance (issue #946). Unlike the three above it is a property of the
   * *contract* rather than of one of its ends, and it needs a jump count and
   * the corpus median to state at all — so it is never produced by
   * `endpointRisks` or `courierRisks`, and the board adds it from
   * `courierGoingRate.ts`.
   */
  | 'over-rate'
  /**
   * This end is one of the systems haulers are most often killed in — a
   * property of traffic rather than of security status, so it comes from
   * `route/chokepoints.ts`'s named list. Reported for either end: a pickup
   * there is as exposed as a delivery.
   */
  | 'gank-chokepoint'
  /**
   * Asks far more in collateral than it pays (issue #1720) — the shape a haul
   * built to be forfeited takes. Contract-scoped like `over-rate`, so the modal
   * adds it from `asksFarMoreCollateralThanReward`. Modal-only: it earns no
   * row marker (decision `20260912-172628`).
   */
  | 'high-collateral';

/**
 * Every J-space system sits in the 11000000 region block, and the contract row
 * carries its own region natively.
 *
 * This is the fallback for an endpoint nothing local places, which in this
 * block means a J-named system: `stations.json` holds no NPC station in any of
 * them, so such an endpoint has no system, no band and no gate count to judge,
 * and the region id is the one local fact that survives. A *placeable* endpoint
 * in the same block — Thera and the Drifter systems, which are not J-named and
 * do have NPC stations — is answered by `hasStargates` directly.
 */
export function isWormholeRegion(regionId: number | null): boolean {
  // Bounded above as well as below: the blocks past this one are Abyssal and
  // the unreachable dev regions, which are not wormhole space and have their
  // own reasons for being unreachable. An unbounded test would name them wrong.
  return regionId !== null && regionId >= 11_000_000 && regionId < 12_000_000;
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
 * `player-structure` is a delivery-only conclusion, which is the shape the
 * ticket asks for. An inaccessible *pickup* is arguably the same trap — a
 * public courier contract is accepted remotely and the collateral is taken
 * then — but widening it is a call for #944's follow-up, not a silent one here.
 */
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
    // And nothing else. `classifySpace` bands wormhole space by the `J######`
    // name, so Thera — wormhole space, four NPC stations, no stargates — falls
    // through to its raw security and reads `nullsec`. Adding that note beside
    // this flag would tell the hauler the trip depends on sovereignty,
    // standings or a jump network, none of which is true of anywhere a gate
    // cannot reach. "No gate route" is the stronger and the correct answer.
    return risks;
  }
  if (isGankChokepoint(endpoint.systemId)) risks.push('gank-chokepoint');
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

const RISK_ORDER: readonly CourierRiskKind[] = [
  'player-structure',
  'no-gate-route',
  'gank-chokepoint',
  'nullsec',
];

/**
 * Which risks can stop a haul being delivered at all, and so are the ones a
 * "hide risky routes" control removes.
 *
 * Nullsec is deliberately not among them. Plenty of nullsec hauling is
 * ordinary well-paid work, and hiding it behind a safety control would quietly
 * remove a real market rather than protect anyone.
 */
export function blocksCompletion(risks: readonly CourierRiskKind[]): boolean {
  return risks.some((risk) => risk === 'player-structure' || risk === 'no-gate-route');
}

/**
 * The rows a "hide risky routes" control leaves on screen. Kept beside the flags rather than in `filterCourierContracts`, so the
 * one place that decides what a risk *is* also decides what hiding one means —
 * the two cannot drift into disagreeing about which rows a flag covers.
 */
export function completableCourierRoutes(rows: readonly CourierRouteRow[]): CourierRouteRow[] {
  return rows.filter((row) => !blocksCompletion(courierRisks(row)));
}

/**
 * Collateral at this many times the reward or more earns the `high-collateral`
 * flag (issue #1720). Set well clear of honest high-value freight — a 1B load
 * paying 25M is 40x — so the flag names an outlier rather than ordinary work.
 */
export const HIGH_COLLATERAL_RATIO = 50;

export function asksFarMoreCollateralThanReward(ratio: number | null): boolean {
  return ratio !== null && ratio >= HIGH_COLLATERAL_RATIO;
}

/**
 * The volume above which a freighter is the only hull that will carry the load.
 *
 * A freighter is slow, cannot cloak and is the easiest gank target in the game,
 * so an oversized load on a route through lowsec is bait regardless of what it
 * pays — which the going-rate multiple alone cannot see. Checked against the
 * ticket's own figures: a freighter-gank contract at 50M for 350,000 m³ over 5
 * jumps runs *0.8x* the going rate, below the median rather than above it.
 */
export const FREIGHTER_VOLUME_M3 = 350_000;

export function forcesFreighter(volume: number): boolean {
  return volume > FREIGHTER_VOLUME_M3;
}

/**
 * Whole hours left to decide, floored at zero for a contract already lapsed.
 * A short listing is one of the conditions the documented ganking shape travels
 * with, which is why it sits here rather than among the date formatters.
 */
export function hoursToExpiry(dateExpired: number, now: number): number {
  return Math.max(0, Math.floor((dateExpired - now) / 3_600_000));
}
