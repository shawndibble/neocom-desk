/**
 * What the Contacts table needs beyond ESI's contact row itself: where a
 * player contact is *now*, whether that puts them inside your own corp or
 * alliance, and whether a second entry of yours already covers them through
 * one of those.
 *
 * Pure — the route hands it the affiliations and the standing index it has
 * already loaded (docs/ARCHITECTURE.md: engines never fetch).
 */
import type { CharacterAffiliation, CharacterContact } from '@/esi/endpoints';
import {
  effectiveStanding,
  type ContactStandingIndex,
  type EffectiveStanding,
} from './contactStandings';

export interface ContactAffiliationRow {
  /** Absent for a non-player contact, and for a player ESI would not resolve. */
  corporationId: number | null;
  allianceId: number | null;
  /** Same corp as the character whose contact list this is. */
  inOwnCorporation: boolean;
  inOwnAlliance: boolean;
  /**
   * A corp or alliance entry of yours that also covers this pilot. Context
   * only: EVE applies the personal entry first, so this never overrides the
   * row's own standing — it answers "I gave this pilot +10, but do I have
   * their whole alliance blocked?".
   */
  alsoVia: EffectiveStanding | null;
}

/** The ids a player contact's affiliation is compared against. */
export interface OwnAffiliation {
  corporationId?: number;
  allianceId?: number;
}

const NOT_A_PLAYER: ContactAffiliationRow = {
  corporationId: null,
  allianceId: null,
  inOwnCorporation: false,
  inOwnAlliance: false,
  alsoVia: null,
};

/**
 * A corporation, alliance or faction contact *is* its own affiliation, so the
 * column would only repeat the name column for it — those rows get nothing
 * rather than a duplicate.
 */
export function contactAffiliationRow(
  contact: CharacterContact,
  affiliations: ReadonlyMap<number, CharacterAffiliation>,
  own: OwnAffiliation,
  index: ContactStandingIndex
): ContactAffiliationRow {
  if (contact.contact_type !== 'character') return NOT_A_PLAYER;
  const affiliation = affiliations.get(contact.contact_id);
  if (!affiliation) return NOT_A_PLAYER;
  const corporationId = affiliation.corporation_id;
  const allianceId = affiliation.alliance_id ?? null;
  return {
    corporationId,
    allianceId,
    // `own` fields are optional: an unknown own corp must not read as a match
    // against a contact whose corp is also unknown.
    inOwnCorporation: own.corporationId !== undefined && own.corporationId === corporationId,
    inOwnAlliance:
      own.allianceId !== undefined && allianceId !== null && own.allianceId === allianceId,
    // Deliberately omits `characterId`: the personal entry is the row itself,
    // and reporting it here would make every row claim a second source.
    alsoVia: effectiveStanding(index, {
      corporationId,
      allianceId: allianceId ?? undefined,
    }),
  };
}
