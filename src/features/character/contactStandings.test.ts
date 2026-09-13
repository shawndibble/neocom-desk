import { describe, it, expect } from 'vitest';
import type { CharacterContact } from '@/esi/endpoints';
import {
  buildContactStandingIndex,
  effectiveStanding,
  STANDING_PRECEDENCE,
} from './contactStandings';

function contact(
  contactId: number,
  contactType: CharacterContact['contact_type'],
  standing: number,
  extra: Partial<CharacterContact> = {}
): CharacterContact {
  return {
    contact_id: contactId,
    contact_type: contactType,
    standing,
    is_blocked: false,
    is_watched: false,
    ...extra,
  };
}

const CONTACTS: CharacterContact[] = [
  contact(1, 'character', 10),
  contact(2, 'corporation', -10, { is_blocked: true }),
  contact(3, 'alliance', 5),
  contact(4, 'faction', -5),
];

describe('buildContactStandingIndex', () => {
  it('keys entries by type as well as id, so a corp and a pilot sharing an id do not collide', () => {
    const index = buildContactStandingIndex([
      contact(7, 'character', 10),
      contact(7, 'corporation', -10),
    ]);

    expect(effectiveStanding(index, { characterId: 7 })?.standing).toBe(10);
    expect(effectiveStanding(index, { corporationId: 7 })?.standing).toBe(-10);
  });

  it('keeps the first entry when ESI repeats an id, rather than letting a duplicate win', () => {
    const index = buildContactStandingIndex([
      contact(1, 'character', 10),
      contact(1, 'character', -10),
    ]);

    expect(effectiveStanding(index, { characterId: 1 })?.standing).toBe(10);
  });
});

describe('effectiveStanding', () => {
  const index = buildContactStandingIndex(CONTACTS);

  it('returns null when no tier of the target is a contact at all', () => {
    expect(effectiveStanding(index, { characterId: 99, corporationId: 98 })).toBeNull();
  });

  it('reports the entry that supplied the standing, not just the number', () => {
    expect(effectiveStanding(index, { characterId: 1 })).toEqual({
      standing: 10,
      source: 'character',
      sourceId: 1,
      inherited: false,
      contact: CONTACTS[0],
    });
  });

  it('inherits the corporation entry when the pilot has none of their own', () => {
    expect(effectiveStanding(index, { characterId: 99, corporationId: 2 })).toEqual({
      standing: -10,
      source: 'corporation',
      sourceId: 2,
      inherited: true,
      contact: CONTACTS[1],
    });
  });

  it('prefers a personal entry over the corporation and alliance ones', () => {
    const result = effectiveStanding(index, { characterId: 1, corporationId: 2, allianceId: 3 });

    expect(result).toMatchObject({ standing: 10, source: 'character' });
  });

  it('prefers the corporation entry over the alliance one', () => {
    const result = effectiveStanding(index, { characterId: 99, corporationId: 2, allianceId: 3 });

    expect(result).toMatchObject({ standing: -10, source: 'corporation' });
  });

  it('falls through to the alliance, then the faction', () => {
    expect(effectiveStanding(index, { characterId: 99, allianceId: 3 })).toMatchObject({
      standing: 5,
      source: 'alliance',
    });
    expect(effectiveStanding(index, { characterId: 99, factionId: 4 })).toMatchObject({
      standing: -5,
      source: 'faction',
    });
  });

  it('treats a standing of 0 as a real entry, not as "no entry"', () => {
    const zeroed = buildContactStandingIndex([
      contact(1, 'character', 0),
      contact(2, 'corporation', -10),
    ]);

    expect(effectiveStanding(zeroed, { characterId: 1, corporationId: 2 })).toMatchObject({
      standing: 0,
      source: 'character',
    });
  });

  it('carries the blocked/watched flags of whichever entry won', () => {
    expect(effectiveStanding(index, { corporationId: 2 })?.contact.is_blocked).toBe(true);
  });

  it('resolves in the documented precedence order', () => {
    expect(STANDING_PRECEDENCE).toEqual(['character', 'corporation', 'alliance', 'faction']);
  });
});
