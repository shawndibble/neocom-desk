/**
 * The derived figures a hauler judges a public courier contract by (issues
 * #938, #943) — the arithmetic only, so the courier table and its detail
 * modal read the same rules rather than each dividing for itself.
 *
 * Every one of them returns `null` for a denominator that makes the figure
 * unknowable, and never `Infinity` or `NaN`. That is not defensive
 * programming: the publisher's numeric parser rejects only an empty column,
 * so a stated `0` volume, reward or collateral is kept deliberately and
 * reaches the client as a real row.
 *
 * `null` therefore means "no such figure", which the UI must show as
 * unavailable and sort last — distinct from a figure that genuinely is zero.
 */

/**
 * ISK per m³ — what the haul pays for the cargo space it occupies.
 *
 * The secondary rate, not the ranking one: a hauler's cost is the trip, so
 * `iskPerJump` is what the board sorts on. This one answers the narrower
 * question of a hauler filling one hold from several contracts along a lane,
 * where space rather than distance is the scarce thing.
 */
export function iskPerVolume(reward: number, volume: number): number | null {
  if (!(volume > 0)) return null;
  return reward / volume;
}

/**
 * ISK per jump — the rate the courier board ranks on.
 *
 * A same-system haul is zero jumps and a real job, so it earns its whole
 * reward for the one trip it is rather than dividing by zero. An unknown
 * distance — an endpoint this app cannot place, or two ends no stargate
 * connects — has no rate at all.
 */
export function iskPerJump(reward: number, jumps: number | null): number | null {
  if (jumps === null) return null;
  return reward / Math.max(jumps, 1);
}

/**
 * How many times the reward the hauler must put up to take the job.
 *
 * The scam signal the player community names first: a contract asking far
 * more in collateral than it pays is one built to be forfeited rather than
 * completed. A ratio against a reward of zero is unknowable rather than
 * infinite — and a free haul carrying collateral is exactly the shape worth
 * showing, so the caller must render that case rather than drop it.
 */
export function collateralToRewardRatio(collateral: number, reward: number): number | null {
  if (!(reward > 0)) return null;
  return collateral / reward;
}
