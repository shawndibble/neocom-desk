import { describe, expect, it } from 'vitest';
import { NOTIFICATION_EVENT_IDS, isCorpEventId } from './events';
import { layoutNotificationEvents } from './notificationLayout';

describe('layoutNotificationEvents', () => {
  it('lists ordinary events first, Quickbar price alerts among them, then corp, then EVE last', () => {
    const layout = layoutNotificationEvents(NOTIFICATION_EVENT_IDS);

    expect(layout.ordinary).toContain('priceAlertTriggered');
    expect(layout.ordinary.at(-1)).toBe('priceAlertTriggered');
    expect(layout.ordinary.some(isCorpEventId)).toBe(false);
    expect(layout.ordinary).not.toContain('eveNotification');
    expect(layout.corp.length).toBeGreaterThan(0);
    expect(layout.corp.every(isCorpEventId)).toBe(true);
    expect(layout.eve).toBe('eveNotification');
  });

  it('files every event exactly once', () => {
    const layout = layoutNotificationEvents(NOTIFICATION_EVENT_IDS);
    const all = [...layout.ordinary, ...layout.corp, ...(layout.eve ? [layout.eve] : [])];
    expect([...all].sort()).toEqual([...NOTIFICATION_EVENT_IDS].sort());
  });

  it('keeps only what it is given, so a search that narrows to corp rows shows just those', () => {
    const layout = layoutNotificationEvents(['corpMemberJoined', 'newMail']);
    expect(layout).toEqual({ ordinary: ['newMail'], corp: ['corpMemberJoined'], eve: null });
  });

  it('puts the price alert after the other ordinary events whatever order it is given', () => {
    const layout = layoutNotificationEvents([
      'priceAlertTriggered',
      'newMail',
      'skillLevelComplete',
    ]);
    expect(layout.ordinary).toEqual(['newMail', 'skillLevelComplete', 'priceAlertTriggered']);
  });
});
