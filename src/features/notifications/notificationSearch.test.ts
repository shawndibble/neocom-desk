import { describe, it, expect } from 'vitest';
import { filterNotificationEvents } from './notificationSearch';

describe('filterNotificationEvents', () => {
  const characters = [
    { characterId: 1, characterName: 'Pilot One' },
    { characterId: 2, characterName: 'Pilot Two' },
    { characterId: 3, characterName: 'Mero Otichoda' },
  ];
  const events = [
    { id: 'newMail' as const, label: 'New Mail' },
    { id: 'skillQueueEnding' as const, label: 'Skill Queue Ending' },
  ];

  it('is null (no filter) under the minimum query length', () => {
    expect(filterNotificationEvents(characters, events, 'ne')).toBeNull();
  });

  it('an event-name match shows only those events, with every character', () => {
    const result = filterNotificationEvents(characters, events, 'mail')!;
    expect([...result.visibleEventIds]).toEqual(['newMail']);
    expect(result.characterIds).toBeNull();
  });

  it('a character-name match shows every event, narrowed to the matching characters', () => {
    const result = filterNotificationEvents(characters, events, 'pilot')!;
    expect([...result.visibleEventIds]).toEqual(['newMail', 'skillQueueEnding']);
    expect([...result.characterIds!]).toEqual([1, 2]);
  });

  it('shows nothing when neither matches', () => {
    const result = filterNotificationEvents(characters, events, 'zzzz')!;
    expect(result.visibleEventIds.size).toBe(0);
  });

  it('when both match, events win so the rows stay the ones the query names', () => {
    const result = filterNotificationEvents(
      [{ characterId: 9, characterName: 'Mailer Dan' }],
      events,
      'mail'
    )!;
    expect([...result.visibleEventIds]).toEqual(['newMail']);
    expect(result.characterIds).toBeNull();
  });
});
