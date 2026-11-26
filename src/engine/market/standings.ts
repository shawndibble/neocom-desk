export interface CharacterStandingEntry {
  from_id: number;
  from_type: 'agent' | 'npc_corp' | 'faction';
  standing: number;
}

export interface ResolvedStandings {
  factionStanding: number;
  corpStanding: number;
  safetyTaxPct?: number;
  feeDiscountFactor?: number;
}

export const ZERO_STANDINGS: ResolvedStandings = { factionStanding: 0, corpStanding: 0 };

export function resolveOwnerStandings(
  ownerCorporationId: number | null,
  ownerFactionId: number | null,
  standings: readonly CharacterStandingEntry[]
): ResolvedStandings {
  if (ownerCorporationId === null) return ZERO_STANDINGS;

  const corpStanding = standings.find((s) => s.from_id === ownerCorporationId)?.standing ?? 0;
  const factionStanding =
    ownerFactionId !== null
      ? (standings.find((s) => s.from_id === ownerFactionId)?.standing ?? 0)
      : 0;

  return { factionStanding, corpStanding };
}
