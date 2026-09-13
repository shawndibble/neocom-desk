import { describe, it, expect } from 'vitest';
import type { CharacterContact } from '@/esi/endpoints';
import {
  ALL_CONTACT_TYPES,
  EMPTY_CONTACTS_FILTER,
  STANDING_CATEGORIES,
  activeContactsFilterCount,
  contactCountsByStanding,
  contactCountsByType,
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

  it('tallies every contact type, including ones with no contacts', () => {
    expect(contactCountsByType(CONTACTS)).toEqual({
      character: 2,
      corporation: 1,
      alliance: 1,
      faction: 0,
    });
  });

  it('exposes both vocabularies in display order', () => {
    expect(STANDING_CATEGORIES).toEqual(['good', 'neutral', 'bad']);
    expect(ALL_CONTACT_TYPES).toEqual(['character', 'corporation', 'alliance', 'faction']);
  });
});
