import type { NetworkOpportunity } from '@/engine/pi/network';

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

export function dropOtherSystemSurplus(
  opportunities: readonly NetworkOpportunity[],
  systemOf: ReadonlyMap<number, number>
): NetworkOpportunity[] {
  return opportunities.filter((opportunity) => {
    const host = systemOf.get(opportunity.hostPlanetId);
    return opportunity.inputs.every(
      (input) =>
        input.source !== 'routed' ||
        input.fromPlanetId === null ||
        (host !== undefined && systemOf.get(input.fromPlanetId) === host)
    );
  });
}
