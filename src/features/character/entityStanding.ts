/**
 * Effective standing for an arbitrary character id — a contract issuer, a
 * mail sender — folding in their current corp/alliance/faction so a
 * stranger with no personal contact entry still matches one the pilot holds
 * on their corp or alliance (`contactStandings.ts`'s own scope note: this
 * resolves the *pilot's* contacts, not the target's).
 *
 * Its own module rather than inlined per caller: Contracts and Mail both
 * need "index + this id's affiliation -> EffectiveStanding | null", and
 * `affiliations.get` returning `undefined` for an unresolved id must fall
 * through to a personal-only match rather than throwing.
 */
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
