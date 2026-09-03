import { describe, it, expect } from 'vitest';
import type { NotificationFeedEntry } from './feed';
import {
  visibleFeedEntries,
  entriesForCharacter,
  otherCharacterAlerts,
  knownEveTypesForCharacter,
} from './feedSelection';
import type { NotificationPreferencesValue } from './preferences';

function entry(over: Partial<NotificationFeedEntry> = {}): NotificationFeedEntry {
  return {
    id: 'id-1',
    characterId: 1,
    eventId: 'newMail',
    title: 't',
    body: 'b',
    firedAt: 1000,
    ...over,
  };
}

const ALL_ON: NotificationPreferencesValue = { masterEnabled: true, perCharacter: {} };

describe('visibleFeedEntries', () => {
  it('keeps everything when no event is toggled off', () => {
    const entries = [entry({ id: 'a' }), entry({ id: 'b', eventId: 'walletBalanceChanged' })];
    expect(visibleFeedEntries(entries, ALL_ON).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('hides an entry whose event the character has switched off', () => {
    const prefs: NotificationPreferencesValue = {
      masterEnabled: true,
      perCharacter: { 1: { newMail: false } },
    };
    const entries = [entry({ id: 'a' }), entry({ id: 'b', eventId: 'walletBalanceChanged' })];
    expect(visibleFeedEntries(entries, prefs).map((e) => e.id)).toEqual(['b']);
  });

  it('scopes the toggle to the character that fired it', () => {
    const prefs: NotificationPreferencesValue = {
      masterEnabled: true,
      perCharacter: { 1: { newMail: false } },
    };
    const entries = [entry({ id: 'a', characterId: 1 }), entry({ id: 'b', characterId: 2 })];
    expect(visibleFeedEntries(entries, prefs).map((e) => e.id)).toEqual(['b']);
  });

  it('keeps an entry whose event id is no longer in the catalog', () => {
    const entries = [entry({ id: 'a', eventId: 'somethingRetired' })];
    expect(visibleFeedEntries(entries, ALL_ON).map((e) => e.id)).toEqual(['a']);
  });

  it('keeps an eveNotification entry by default (feed-on is the per-type default)', () => {
    const entries = [entry({ id: 'a', eventId: 'eveNotification', eveType: 'BillOutOfMoneyMsg' })];
    expect(visibleFeedEntries(entries, ALL_ON).map((e) => e.id)).toEqual(['a']);
  });

  it('hides an eveNotification entry whose specific type the character opted out of on feed', () => {
    const prefs: NotificationPreferencesValue = {
      masterEnabled: true,
      perCharacter: {},
      eveNotificationTypesByCharacter: { 1: { BillOutOfMoneyMsg: { feed: false } } },
    };
    const entries = [
      entry({ id: 'a', eventId: 'eveNotification', eveType: 'BillOutOfMoneyMsg' }),
      entry({ id: 'b', eventId: 'eveNotification', eveType: 'AllWarDeclaredMsg' }),
    ];
    expect(visibleFeedEntries(entries, prefs).map((e) => e.id)).toEqual(['b']);
  });
});

describe('entriesForCharacter', () => {
  it('keeps only the given character, order preserved', () => {
    const entries = [
      entry({ id: 'a', characterId: 1 }),
      entry({ id: 'b', characterId: 2 }),
      entry({ id: 'c', characterId: 1 }),
    ];
    expect(entriesForCharacter(entries, 1).map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('is empty with no active character', () => {
    expect(entriesForCharacter([entry()], null)).toEqual([]);
  });
});

describe('otherCharacterAlerts', () => {
  const names = new Map([
    [1, 'Active Pilot'],
    [2, 'Alt One'],
    [3, 'Alt Two'],
  ]);

  it('counts per character, excluding the active one', () => {
    const entries = [
      entry({ id: 'a', characterId: 1 }),
      entry({ id: 'b', characterId: 2 }),
      entry({ id: 'c', characterId: 2 }),
      entry({ id: 'd', characterId: 3 }),
    ];
    expect(otherCharacterAlerts(entries, 1, names)).toEqual([
      { characterId: 2, name: 'Alt One', count: 2 },
      { characterId: 3, name: 'Alt Two', count: 1 },
    ]);
  });

  it('breaks a count tie by name so the row does not reshuffle between polls', () => {
    const entries = [entry({ id: 'a', characterId: 3 }), entry({ id: 'b', characterId: 2 })];
    expect(otherCharacterAlerts(entries, 1, names).map((a) => a.name)).toEqual([
      'Alt One',
      'Alt Two',
    ]);
  });

  it('skips a character whose name is unknown (removed since the fire)', () => {
    const entries = [entry({ id: 'a', characterId: 99 })];
    expect(otherCharacterAlerts(entries, 1, names)).toEqual([]);
  });

  it('is empty when only the active character has alerts', () => {
    expect(otherCharacterAlerts([entry({ characterId: 1 })], 1, names)).toEqual([]);
  });
});

describe('knownEveTypesForCharacter', () => {
  it('is empty with no eveNotification entries or toggled types', () => {
    expect(knownEveTypesForCharacter([entry()], 1, ALL_ON)).toEqual([]);
  });

  it('lists distinct types this character has seen, sorted', () => {
    const entries = [
      entry({ id: 'a', eventId: 'eveNotification', eveType: 'BillOutOfMoneyMsg' }),
      entry({ id: 'b', eventId: 'eveNotification', eveType: 'AllWarDeclaredMsg' }),
      entry({ id: 'c', eventId: 'eveNotification', eveType: 'BillOutOfMoneyMsg' }),
    ];
    expect(knownEveTypesForCharacter(entries, 1, ALL_ON)).toEqual([
      'AllWarDeclaredMsg',
      'BillOutOfMoneyMsg',
    ]);
  });

  it('scopes to the given character', () => {
    const entries = [
      entry({ id: 'a', characterId: 2, eventId: 'eveNotification', eveType: 'AllWarDeclaredMsg' }),
    ];
    expect(knownEveTypesForCharacter(entries, 1, ALL_ON)).toEqual([]);
  });

  it('keeps a type toggled off the feed visible even once its entries have aged out of the feed', () => {
    const prefs: NotificationPreferencesValue = {
      masterEnabled: true,
      perCharacter: {},
      eveNotificationTypesByCharacter: { 1: { BillOutOfMoneyMsg: { feed: false } } },
    };
    // No feed entries at all for this character — the type's rows evicted
    // past NOTIFICATION_FEED_LIMIT, or it was toggled off before ever firing
    // while the feed was visible.
    expect(knownEveTypesForCharacter([], 1, prefs)).toEqual(['BillOutOfMoneyMsg']);
  });

  it("does not leak another character's toggled types", () => {
    const prefs: NotificationPreferencesValue = {
      masterEnabled: true,
      perCharacter: {},
      eveNotificationTypesByCharacter: { 2: { AllWarDeclaredMsg: { feed: false } } },
    };
    expect(knownEveTypesForCharacter([], 1, prefs)).toEqual([]);
  });
});
