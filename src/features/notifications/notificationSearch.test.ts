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

describe('filterNotificationEvents with EVE notification types', () => {
  const characters = [{ characterId: 1, characterName: 'Pilot One' }];
  const events = [
    { id: 'newMail' as const, label: 'New Mail' },
    { id: 'eveNotification' as const, label: 'EVE notifications' },
  ];
  const eveTypes = [
    { type: 'StructureFuelAlert', label: 'Structure Fuel Alert' },
    { type: 'StructureUnderAttack', label: 'Structure Under Attack' },
    { type: 'CorpAllBillMsg', label: 'Corp All Bill' },
  ];

  it('an EVE-type-only match shows the EVE notifications row and just the matching types', () => {
    const result = filterNotificationEvents(characters, events, 'fuel', eveTypes)!;
    expect([...result.visibleEventIds]).toEqual(['eveNotification']);
    expect([...result.visibleEveTypes]).toEqual(['StructureFuelAlert']);
    expect(result.characterIds).toBeNull();
  });

  it('matches case-insensitively and across the whole label', () => {
    const result = filterNotificationEvents(characters, events, 'UNDER att', eveTypes)!;
    expect([...result.visibleEveTypes]).toEqual(['StructureUnderAttack']);
  });

  it('an app-event-only match shows no EVE types', () => {
    const result = filterNotificationEvents(characters, events, 'mail', eveTypes)!;
    expect([...result.visibleEventIds]).toEqual(['newMail']);
    expect(result.visibleEveTypes.size).toBe(0);
  });

  it('a query matching both lists the app event and the EVE types together', () => {
    const both = [...events, { id: 'skillQueueEnding' as const, label: 'Structure skills' }];
    const result = filterNotificationEvents(characters, both, 'structure', [...eveTypes])!;
    expect([...result.visibleEventIds].sort()).toEqual(['eveNotification', 'skillQueueEnding']);
    expect([...result.visibleEveTypes]).toEqual(['StructureFuelAlert', 'StructureUnderAttack']);
    expect(result.characterIds).toBeNull();
  });

  it('naming the EVE notifications row itself shows the row without dumping every type', () => {
    const result = filterNotificationEvents(characters, events, 'EVE notif', eveTypes)!;
    expect([...result.visibleEventIds]).toEqual(['eveNotification']);
    expect(result.visibleEveTypes.size).toBe(0);
  });

  it('a type match wins over a character-name match, so the rows named stay', () => {
    const result = filterNotificationEvents(
      [{ characterId: 9, characterName: 'Fuel Jockey' }],
      events,
      'fuel',
      eveTypes
    )!;
    expect([...result.visibleEventIds]).toEqual(['eveNotification']);
    expect(result.characterIds).toBeNull();
  });

  it('is null (no filter) for an empty or too-short query', () => {
    expect(filterNotificationEvents(characters, events, '', eveTypes)).toBeNull();
    expect(filterNotificationEvents(characters, events, 'fu', eveTypes)).toBeNull();
  });

  it('shows nothing when no event, type or character matches', () => {
    const result = filterNotificationEvents(characters, events, 'zzzz', eveTypes)!;
    expect(result.visibleEventIds.size).toBe(0);
    expect(result.visibleEveTypes.size).toBe(0);
  });

  it('works without any EVE types supplied, as before', () => {
    const result = filterNotificationEvents(characters, events, 'fuel')!;
    expect(result.visibleEventIds.size).toBe(0);
    expect(result.visibleEveTypes.size).toBe(0);
  });
});
