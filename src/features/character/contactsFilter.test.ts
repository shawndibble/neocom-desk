import { describe, it, expect } from 'vitest';
import type { CharacterContact } from '@/esi/endpoints';
import {
  ALL_CONTACT_KINDS,
  EMPTY_CONTACTS_FILTER,
  STANDING_CATEGORIES,
  activeContactsFilterCount,
  contactCountsByStanding,
  contactCountsByKind,
  contactKind,
  contactTypeLabelKey,
  filterContacts,
  standingCategory,
} from './contactsFilter';

function contact(
  contactId: number,
  contactType: CharacterContact['contact_type'],
  standing: number
): CharacterContact {
  return {
    contact_id: contactId,
    contact_type: contactType,
    standing,
    is_blocked: false,
    is_watched: false,
  };
}

const CONTACTS: CharacterContact[] = [
  contact(1, 'character', 10),
  contact(2, 'corporation', 0),
  contact(3, 'alliance', -10),
  contact(4, 'character', -5),
];

const NAMES = new Map([
  [1, 'Alice Cadelanne'],
  [2, 'Brave Newbies Inc.'],
  [3, 'Goonswarm Federation'],
]);

/** An NPC agent and an NPC corporation, by CCP's id blocks. */
const NPCS: CharacterContact[] = [
  contact(3008416, 'character', 5),
  contact(1000125, 'corporation', 5),
];

function ids(contacts: readonly CharacterContact[]): number[] {
  return contacts.map((c) => c.contact_id);
}

describe('standingCategory', () => {
  it('splits on sign, with zero its own category', () => {
    expect(standingCategory(0.1)).toBe('good');
    expect(standingCategory(0)).toBe('neutral');
    expect(standingCategory(-0.1)).toBe('bad');
  });
});

describe('filterContacts', () => {
  it('passes everything through under the empty filter', () => {
    expect(ids(filterContacts(CONTACTS, EMPTY_CONTACTS_FILTER, NAMES))).toEqual([1, 2, 3, 4]);
  });

  it('matches free text against the resolved name, case-insensitively', () => {
    const filter = { ...EMPTY_CONTACTS_FILTER, text: 'goons' };

    expect(ids(filterContacts(CONTACTS, filter, NAMES))).toEqual([3]);
  });

  it('ignores surrounding whitespace in the search text', () => {
    const filter = { ...EMPTY_CONTACTS_FILTER, text: '  alice  ' };

    expect(ids(filterContacts(CONTACTS, filter, NAMES))).toEqual([1]);
  });

  it('matches the raw id for a contact whose name has not resolved', () => {
    const filter = { ...EMPTY_CONTACTS_FILTER, text: '4' };

    expect(ids(filterContacts(CONTACTS, filter, NAMES))).toEqual([4]);
  });

  it('keeps only the selected types', () => {
    const filter = { ...EMPTY_CONTACTS_FILTER, types: new Set(['character' as const]) };

    expect(ids(filterContacts(CONTACTS, filter, NAMES))).toEqual([1, 4]);
  });

  it('keeps only the selected standing categories', () => {
    const filter = { ...EMPTY_CONTACTS_FILTER, standings: new Set(['bad' as const]) };

    expect(ids(filterContacts(CONTACTS, filter, NAMES))).toEqual([3, 4]);
  });

  it('ANDs every active criterion', () => {
    const filter = {
      text: 'a',
      types: new Set(['character' as const]),
      standings: new Set(['good' as const]),
    };

    expect(ids(filterContacts(CONTACTS, filter, NAMES))).toEqual([1]);
  });

  it('returns nothing when a category is switched off entirely', () => {
    const filter = { ...EMPTY_CONTACTS_FILTER, types: new Set<never>() };

    expect(filterContacts(CONTACTS, filter, NAMES)).toEqual([]);
  });
});

describe('activeContactsFilterCount', () => {
  it('counts nothing for the empty filter', () => {
    expect(activeContactsFilterCount(EMPTY_CONTACTS_FILTER)).toBe(0);
  });

  it('counts each narrowed group once, however many members it lost', () => {
    expect(
      activeContactsFilterCount({
        text: 'x',
        types: new Set(['character' as const]),
        standings: new Set(['good' as const, 'bad' as const]),
      })
    ).toBe(3);
  });
});

describe('counts', () => {
  it('tallies every standing category, including ones with no contacts', () => {
    expect(contactCountsByStanding(CONTACTS)).toEqual({ good: 1, neutral: 1, bad: 2 });
    expect(contactCountsByStanding([])).toEqual({ good: 0, neutral: 0, bad: 0 });
  });

  it('tallies every contact kind, including ones with no contacts', () => {
    expect(contactCountsByKind(CONTACTS)).toEqual({
      character: 2,
      npc: 0,
      corporation: 1,
      alliance: 1,
      faction: 0,
    });
    expect(contactCountsByKind([...CONTACTS, ...NPCS])).toMatchObject({ character: 2, npc: 2 });
  });

  it('exposes both vocabularies in display order', () => {
    expect(STANDING_CATEGORIES).toEqual(['good', 'neutral', 'bad']);
    expect(ALL_CONTACT_KINDS).toEqual(['character', 'npc', 'corporation', 'alliance', 'faction']);
  });
});

describe('contactKind', () => {
  it('splits NPC agents and NPC corporations out of their ESI type', () => {
    expect(contactKind(NPCS[0])).toBe('npc');
    expect(contactKind(NPCS[1])).toBe('npc');
    expect(contactKind(CONTACTS[0])).toBe('character');
    expect(contactKind(CONTACTS[1])).toBe('corporation');
  });

  it('never reads an alliance or faction id as an NPC', () => {
    expect(contactKind(contact(500001, 'faction', 0))).toBe('faction');
    expect(contactKind(contact(1000125, 'alliance', 0))).toBe('alliance');
  });

  it('lets the NPCs chip hide NPCs without hiding players or player corps', () => {
    const filter = {
      ...EMPTY_CONTACTS_FILTER,
      types: new Set(ALL_CONTACT_KINDS.filter((kind) => kind !== 'npc')),
    };
    expect(ids(filterContacts([...CONTACTS, ...NPCS], filter, NAMES))).toEqual([1, 2, 3, 4]);
  });

  it('names an NPC by what it is in the Type column', () => {
    expect(contactTypeLabelKey(NPCS[0])).toBe('contacts.typeNpcAgent');
    expect(contactTypeLabelKey(NPCS[1])).toBe('contacts.typeNpcCorporation');
    expect(contactTypeLabelKey(CONTACTS[0])).toBe('contacts.typeCharacter');
  });
});
