/**
 * Whether a ship's mass lets it use a wormhole or an Ansiblex (issue #2906).
 *
 * The only hard claim is the per-jump limit: a hull heavier than the hole
 * type's `wormholeMaxJumpMass` can never pass. How much mass a hole has left
 * is unknowable (EVE-Scout reports no status), so the total-mass figure is an
 * upper bound for a fresh hole, never what a given hole has left. Pure.
 */
import type { RouteSafetyTripRow } from './routeSafetyTrip';

/**
 * An Ansiblex Jump Bridge's per-jump limit: 1.48 Mt, dogma attribute 2798
 * (`gateMaxJumpMass`) on type 35841 in the SDE.
 */
export const ANSIBLEX_MAX_JUMP_MASS_KG = 1_480_000_000;

/** Hole type name (EVE-Scout's `wh_type`, "M267") -> [max per jump, max total] in kg. */
export type HoleMassTable = Readonly<Record<string, readonly [number, number]>>;

export type MassVerdict = { kind: 'ok' } | { kind: 'too-heavy'; limitKg: number; shipKg: number };

const OK: MassVerdict = { kind: 'ok' };

function verdictFor(limitKg: number, shipKg: number): MassVerdict {
  return shipKg > limitKg ? { kind: 'too-heavy', limitKg, shipKg } : OK;
}

/** A hole of an unknown type (or K162, which carries no limits) is never blocked: no guessing. */
export function holeMassVerdict(
  wormholeType: string | null,
  shipKg: number,
  table: HoleMassTable
): MassVerdict {
  const limits = wormholeType === null ? undefined : table[wormholeType];
  return limits ? verdictFor(limits[0], shipKg) : OK;
}

export function bridgeMassVerdict(shipKg: number): MassVerdict {
  return verdictFor(ANSIBLEX_MAX_JUMP_MASS_KG, shipKg);
}

/** How many of a route's hole hops and bridge hops the ship is too heavy for. */
export function routeMassCheck(
  rows: readonly Pick<RouteSafetyTripRow, 'entry'>[],
  shipKg: number | null,
  table: HoleMassTable
): { blocked: number; bridgeBlocked: number } {
  let blocked = 0;
  let bridgeBlocked = 0;
  if (shipKg === null) return { blocked, bridgeBlocked };
  for (const { entry } of rows) {
    if (entry?.kind === 'hole') {
      if (holeMassVerdict(entry.hole.wormholeType, shipKg, table).kind !== 'ok') blocked += 1;
    } else if (entry?.kind === 'bridge' && bridgeMassVerdict(shipKg).kind !== 'ok') {
      bridgeBlocked += 1;
    }
  }
  return { blocked, bridgeBlocked };
}
