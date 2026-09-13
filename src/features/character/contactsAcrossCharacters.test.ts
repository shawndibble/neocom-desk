import { describe, it, expect } from 'vitest';
import type { CharacterContact } from '@/esi/endpoints';
import {
  mergeContactsAcrossCharacters,
  type CharacterContactList,
} from './contactsAcrossCharacters';

function contact(
  contactId: number,
  standing: number,
  contactType: CharacterContact['contact_type'] = 'character'
): CharacterContact {
  return {
    contact_id: contactId,
    contact_type: contactType,
    standing,
    is_blocked: false,
    is_watched: false,
  };
}

const MAIN: CharacterContactList = { characterId: 1, name: 'Main', contacts: [contact(10, 10)] };
const ALT: CharacterContactList = { characterId: 2, name: 'Alt', contacts: [contact(10, 10)] };

describe('mergeContactsAcrossCharacters', () => {
  it('returns nothing when no character has any contacts', () => {
    expect(mergeContactsAcrossCharacters([{ characterId: 1, name: 'Main', contacts: [] }])).toEqual(
      []
    );
  });

  it('agrees when every character holds the contact at the same standing', () => {
    const [row] = mergeContactsAcrossCharacters([MAIN, ALT]);

    expect(row).toMatchObject({ contactId: 10, standings: [10], disagrees: false });
    expect(row.held.map((h) => h.name)).toEqual(['Main', 'Alt']);
    expect(row.missing).toEqual([]);
  });

  it('reports the characters a contact is missing from', () => {
    const [row] = mergeContactsAcrossCharacters([
      MAIN,
      { characterId: 2, name: 'Alt', contacts: [] },
    ]);

    expect(row.missing.map((m) => m.name)).toEqual(['Alt']);
    expect(row.disagrees).toBe(true);
  });

  it('disagrees when two characters hold the same contact at different standings', () => {
    const [row] = mergeContactsAcrossCharacters([
      MAIN,
      { characterId: 2, name: 'Alt', contacts: [contact(10, -10)] },
    ]);

    expect(row.standings).toEqual([-10, 10]);
    expect(row.disagrees).toBe(true);
  });

  it('keeps a corp and a character sharing an id apart', () => {
    const rows = mergeContactsAcrossCharacters([
      {
        characterId: 1,
        name: 'Main',
        contacts: [contact(10, 10), contact(10, -10, 'corporation')],
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.contactType).sort()).toEqual(['character', 'corporation']);
  });

  it('holds no opinion about a single character — nothing can disagree with itself', () => {
    const [row] = mergeContactsAcrossCharacters([MAIN]);

    expect(row.disagrees).toBe(false);
    expect(row.missing).toEqual([]);
  });

  it('orders held and missing by the order the characters were given', () => {
    const rows = mergeContactsAcrossCharacters([
      { characterId: 1, name: 'Main', contacts: [] },
      { characterId: 2, name: 'Alt', contacts: [contact(10, 5)] },
      { characterId: 3, name: 'Third', contacts: [contact(10, 5)] },
    ]);

    expect(rows[0].held.map((h) => h.name)).toEqual(['Alt', 'Third']);
    expect(rows[0].missing.map((m) => m.name)).toEqual(['Main']);
  });

  it('carries the flags of every holder, so a contact blocked on one alt only is visible', () => {
    const blocked = { ...contact(10, -10), is_blocked: true };
    const [row] = mergeContactsAcrossCharacters([
      { characterId: 1, name: 'Main', contacts: [blocked] },
      { characterId: 2, name: 'Alt', contacts: [contact(10, -10)] },
    ]);

    expect(row.held.map((h) => h.contact.is_blocked)).toEqual([true, false]);
  });
});
