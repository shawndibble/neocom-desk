import { describe, it, expect } from 'vitest';
import { ESI_REGISTRY } from '@/esi/registry';
import { NOTIFICATION_EVENTS, NOTIFICATION_EVENT_IDS } from './events';

describe('NOTIFICATION_EVENTS', () => {
  it('lists exactly the 10 synthesized events from CONTEXT.md round 20 plus eveNotification (issue #274) and planetaryExtractorExpiring (issue #310), in order', () => {
    expect(NOTIFICATION_EVENT_IDS).toEqual([
      'skillLevelComplete',
      'characterNotTraining',
      'industryJobComplete',
      'newMail',
      'planetaryExtractionDone',
      'planetaryExtractorExpiring',
      'marketOrderFilled',
      'newCalendarEvent',
      'calendarEventStarting',
      'contractAccepted',
      'walletBalanceChanged',
      'eveNotification',
    ]);
  });

  it('has no duplicate ids', () => {
    expect(new Set(NOTIFICATION_EVENT_IDS).size).toBe(NOTIFICATION_EVENT_IDS.length);
  });

  it("derives each event's scope from ESI_REGISTRY rather than a hand-copied string", () => {
    const skillQueueScope = ESI_REGISTRY.getCharacterSkillQueue.scope;
    const skillEvents = NOTIFICATION_EVENTS.filter(
      (e) => e.id === 'skillLevelComplete' || e.id === 'characterNotTraining'
    );
    expect(skillEvents).toHaveLength(2);
    for (const event of skillEvents) expect(event.scope).toBe(skillQueueScope);

    const walletEvent = NOTIFICATION_EVENTS.find((e) => e.id === 'walletBalanceChanged');
    expect(walletEvent?.scope).toBe(ESI_REGISTRY.getCharacterWallet.scope);
  });

  it('gives every event a distinct settings.notifications.event.* label key', () => {
    const keys = NOTIFICATION_EVENTS.map((e) => e.labelKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key.startsWith('settings.notifications.event.')).toBe(true);
  });
});
