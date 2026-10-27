/**
 * Faction/corp standing toward an NPC station's owner, for broker-fee math
 * (`src/engine/industry/fees.ts`). Pure: the caller (features/market,
 * features/character) fetches `/characters/{id}/standings/` and resolves the
 * station's owner corporation/faction from ESI; this module only matches the
 * two together.
 */

/**
 * One row of `GET /characters/{character_id}/standings/` — structurally the
 * same as `@/esi/endpoints`'s `CharacterStanding`, but declared separately
 * rather than imported so this pure engine module carries no dependency
 * (even a type-only one) on the ESI layer. `from_type`'s exact spelling for
 * an NPC corporation row is unconfirmed against a live fetch, so
 * `resolveOwnerStandings` matches on `from_id` alone rather than filtering
 * by it first — see that function's doc.
 */
export interface CharacterStandingEntry {
  from_id: number;
  from_type: 'agent' | 'npc_corp' | 'faction';
  standing: number;
}

export interface ResolvedStandings {
  /** Unmodified standing toward the station owner's faction, -10..10. */
  factionStanding: number;
  /** Unmodified standing toward the station owner's corporation, -10..10. */
  corpStanding: number;
}

export const ZERO_STANDINGS: ResolvedStandings = { factionStanding: 0, corpStanding: 0 };

/**
 * Resolves a station owner's standings from the character's fetched list.
 * `ownerCorporationId === null` means a player structure (or an
 * unresolvable owner) — standings never apply there, so this returns zero
 * without inspecting `standings` at all.
 *
 * Matches by `from_id` alone, ignoring `from_type`: EVE's id ranges for
 * agents, NPC corporations and factions never overlap, so matching by id
 * can't accidentally zero a real standing over a `from_type` enum spelling
 * this app has not verified against a live response.
 */
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
