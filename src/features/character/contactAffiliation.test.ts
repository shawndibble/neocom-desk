import { describe, it, expect } from 'vitest';
import type { CharacterAffiliation, CharacterContact } from '@/esi/endpoints';
import { buildContactStandingIndex } from './contactStandings';
import { contactAffiliationRow } from './contactAffiliation';

function contact(
  contactId: number,
  contactType: CharacterContact['contact_type'],
  standing = 5
): CharacterContact {
  return {
    contact_id: contactId,
    contact_type: contactType,
    standing,
    is_blocked: false,
    is_watched: false,
  };
}

const PILOT = contact(1, 'character', 10);
const AFFILIATIONS = new Map<number, CharacterAffiliation>([
  [1, { character_id: 1, corporation_id: 500, alliance_id: 600 }],
  [2, { character_id: 2, corporation_id: 700 }],
]);
const NO_INDEX = buildContactStandingIndex([]);

describe('contactAffiliationRow', () => {
  it('reports where a player contact is now', () => {
    const row = contactAffiliationRow(PILOT, AFFILIATIONS, {}, NO_INDEX);

    expect(row).toMatchObject({ corporationId: 500, allianceId: 600 });
  });

  it('leaves the alliance null for a player in none', () => {
    const row = contactAffiliationRow(contact(2, 'character'), AFFILIATIONS, {}, NO_INDEX);

    expect(row).toMatchObject({ corporationId: 700, allianceId: null });
  });

  it('says nothing for a corp, alliance or faction contact — it is its own affiliation', () => {
    for (const type of ['corporation', 'alliance', 'faction'] as const) {
      expect(contactAffiliationRow(contact(1, type), AFFILIATIONS, {}, NO_INDEX)).toMatchObject({
        corporationId: null,
        alsoVia: null,
      });
    }
  });

  it('says nothing for a player ESI would not resolve', () => {
    const row = contactAffiliationRow(contact(99, 'character'), AFFILIATIONS, {}, NO_INDEX);

    expect(row.corporationId).toBeNull();
  });

  it('flags a contact sitting in your own corporation or alliance', () => {
    expect(
      contactAffiliationRow(PILOT, AFFILIATIONS, { corporationId: 500 }, NO_INDEX)
    ).toMatchObject({ inOwnCorporation: true, inOwnAlliance: false });
    expect(contactAffiliationRow(PILOT, AFFILIATIONS, { allianceId: 600 }, NO_INDEX)).toMatchObject(
      {
        inOwnAlliance: true,
      }
    );
  });

  it('does not call an unknown own corporation a match against an unknown contact corp', () => {
    const row = contactAffiliationRow(contact(99, 'character'), AFFILIATIONS, {}, NO_INDEX);

    expect(row.inOwnCorporation).toBe(false);
    expect(row.inOwnAlliance).toBe(false);
  });

  it('surfaces a corp entry of yours that also covers the pilot', () => {
    const index = buildContactStandingIndex([contact(500, 'corporation', -10)]);

    expect(contactAffiliationRow(PILOT, AFFILIATIONS, {}, index).alsoVia).toMatchObject({
      standing: -10,
      source: 'corporation',
    });
  });

  it('falls back to an alliance entry when the corp is not one of yours', () => {
    const index = buildContactStandingIndex([contact(600, 'alliance', -5)]);

    expect(contactAffiliationRow(PILOT, AFFILIATIONS, {}, index).alsoVia).toMatchObject({
      standing: -5,
      source: 'alliance',
    });
  });

  it('never reports the pilot’s own entry as a second source', () => {
    const index = buildContactStandingIndex([PILOT]);

    expect(contactAffiliationRow(PILOT, AFFILIATIONS, {}, index).alsoVia).toBeNull();
  });
});
