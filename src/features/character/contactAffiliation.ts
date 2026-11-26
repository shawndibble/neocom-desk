import type { CharacterAffiliation, CharacterContact } from '@/esi/endpoints';
import {
  effectiveStanding,
  type ContactStandingIndex,
  type EffectiveStanding,
} from './contactStandings';

export interface ContactAffiliationRow {
  corporationId: number | null;
  allianceId: number | null;
  inOwnCorporation: boolean;
  inOwnAlliance: boolean;
  alsoVia: EffectiveStanding | null;
}

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
    inOwnCorporation: own.corporationId !== undefined && own.corporationId === corporationId,
    inOwnAlliance:
      own.allianceId !== undefined && allianceId !== null && own.allianceId === allianceId,
    alsoVia: effectiveStanding(index, {
      corporationId,
      allianceId: allianceId ?? undefined,
    }),
  };
}
