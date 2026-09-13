import { describe, it, expect } from 'vitest';
import type { CharacterAffiliation, CharacterContact } from '@/esi/endpoints';
import { buildContactStandingIndex } from './contactStandings';
import { characterStanding } from './entityStanding';

function contact(
  contactId: number,
  contactType: CharacterContact['contact_type'],
  standing: number
): CharacterContact {
  return { contact_id: contactId, contact_type: contactType, standing };
}

describe('characterStanding', () => {
  it('matches a personal contact entry with no affiliation needed at all', () => {
    const index = buildContactStandingIndex([contact(500001, 'character', 10)]);
    expect(characterStanding(index, 500001, new Map())).toMatchObject({
      standing: 10,
      source: 'character',
    });
  });

  it("folds in the target's resolved corp so a stranger's own corp entry still matches", () => {
    const index = buildContactStandingIndex([contact(2, 'corporation', -10)]);
    const affiliations = new Map<number, CharacterAffiliation>([
      [500001, { character_id: 500001, corporation_id: 2 }],
    ]);
    expect(characterStanding(index, 500001, affiliations)).toMatchObject({
      standing: -10,
      source: 'corporation',
      inherited: true,
    });
  });

  it('returns null for an id with neither a personal entry nor a resolved affiliation', () => {
    const index = buildContactStandingIndex([contact(2, 'corporation', -10)]);
    expect(characterStanding(index, 500001, new Map())).toBeNull();
  });
});
