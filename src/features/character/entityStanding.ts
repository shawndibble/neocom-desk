import type { CharacterAffiliation } from '@/esi/endpoints';
import {
  effectiveStanding,
  type ContactStandingIndex,
  type EffectiveStanding,
} from './contactStandings';

export function characterStanding(
  index: ContactStandingIndex,
  characterId: number,
  affiliations: ReadonlyMap<number, CharacterAffiliation>
): EffectiveStanding | null {
  const affiliation = affiliations.get(characterId);
  return effectiveStanding(index, {
    characterId,
    corporationId: affiliation?.corporation_id,
    allianceId: affiliation?.alliance_id,
    factionId: affiliation?.faction_id,
  });
}
