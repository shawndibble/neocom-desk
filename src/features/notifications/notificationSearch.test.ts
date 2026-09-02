import { describe, it, expect } from 'vitest';
import {
  filterNotificationSections,
  NOTIFICATION_SEARCH_MIN_QUERY_LENGTH,
} from './notificationSearch';
import type { NotificationEventId } from './events';

const EVENTS = [
  { id: 'skillLevelComplete' as NotificationEventId, label: 'Skill Level Complete' },
  { id: 'newMail' as NotificationEventId, label: 'New Mail' },
];

const SECTIONS = [
  { characterId: 1, characterName: 'Alice Pilot' },
  { characterId: 2, characterName: 'Bob Trader' },
];

describe('filterNotificationSections', () => {
  it('returns null (no filter) under the minimum query length', () => {
    expect(NOTIFICATION_SEARCH_MIN_QUERY_LENGTH).toBeGreaterThan(0);
    const shortQuery = 'a'.repeat(NOTIFICATION_SEARCH_MIN_QUERY_LENGTH - 1);
    expect(filterNotificationSections(SECTIONS, EVENTS, shortQuery)).toBeNull();
  });

  it('matches a section by event-type name, showing only the matching events', () => {
    const result = filterNotificationSections(SECTIONS, EVENTS, 'mail');
    expect(result).not.toBeNull();
    expect([...result!.visibleCharacterIds].sort()).toEqual([1, 2]);
    expect(result!.visibleEventIdsByCharacter.get(1)).toEqual(new Set(['newMail']));
    expect(result!.visibleEventIdsByCharacter.get(2)).toEqual(new Set(['newMail']));
  });

  it('matches a section by character name, showing every event for that character', () => {
    const result = filterNotificationSections(SECTIONS, EVENTS, 'alice');
    expect(result).not.toBeNull();
    expect([...result!.visibleCharacterIds]).toEqual([1]);
    expect(result!.visibleEventIdsByCharacter.get(1)).toEqual(
      new Set(['skillLevelComplete', 'newMail'])
    );
  });

  it('hides a section with no matching event and no matching character name', () => {
    const result = filterNotificationSections(SECTIONS, EVENTS, 'zzz-no-match');
    expect(result).not.toBeNull();
    expect(result!.visibleCharacterIds.size).toBe(0);
  });

  it('is case-insensitive', () => {
    const result = filterNotificationSections(SECTIONS, EVENTS, 'MAIL');
    expect([...result!.visibleCharacterIds].sort()).toEqual([1, 2]);
  });
});
