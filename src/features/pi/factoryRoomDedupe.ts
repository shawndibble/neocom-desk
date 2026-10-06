import type { NetworkOpportunity } from '@/engine/pi/network';

/**
 * One host's factory-room wins, minus the ones that would spend a surplus an
 * earlier (better-paying) win already claimed. Two wins on the same routed or
 * local input are one surplus counted twice: the headline would add them. A
 * product also appears once. Bought inputs are nobody's surplus, so they
 * never clash. Order of the survivors follows the input.
 */
export function dropSharedSurplus(
  opportunities: readonly NetworkOpportunity[]
): NetworkOpportunity[] {
  const byGain = [...opportunities].sort((a, b) => b.marginPerHour - a.marginPerHour);
  const claimed = new Set<string>();
  const products = new Set<number>();
  const keep = new Set<NetworkOpportunity>();
  for (const opportunity of byGain) {
    if (products.has(opportunity.typeId)) continue;
    const keys = opportunity.inputs
      .filter((input) => input.source !== 'bought')
      .map((input) => `${input.fromPlanetId ?? 'host'}:${input.typeId}`);
    if (keys.some((key) => claimed.has(key))) continue;
    products.add(opportunity.typeId);
    for (const key of keys) claimed.add(key);
    keep.add(opportunity);
  }
  return opportunities.filter((opportunity) => keep.has(opportunity));
}
