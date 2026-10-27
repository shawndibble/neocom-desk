import { describe, expect, it } from 'vitest';
import { NOTIFICATION_EVENT_IDS, isCorpEventId } from './events';
import { groupNotificationEvents, EVENT_GROUP_KEYS } from './eventGroups';

describe('groupNotificationEvents', () => {
  it('files every catalog event exactly once', () => {
    const layout = groupNotificationEvents(NOTIFICATION_EVENT_IDS);
    const all = [
      ...layout.groups.flatMap((group) => group.eventIds),
      ...layout.corp,
      ...(layout.eve ? [layout.eve] : []),
    ];
    expect([...all].sort()).toEqual([...NOTIFICATION_EVENT_IDS].sort());
  });

  it('keeps corp events and EVE notifications out of the named groups', () => {
    const layout = groupNotificationEvents(NOTIFICATION_EVENT_IDS);
    const grouped = layout.groups.flatMap((group) => group.eventIds);
    expect(grouped.some(isCorpEventId)).toBe(false);
    expect(grouped).not.toContain('eveNotification');
    expect(layout.corp.every(isCorpEventId)).toBe(true);
    expect(layout.eve).toBe('eveNotification');
  });

  it('lists groups in a fixed order and puts the price alert last in its group', () => {
    const layout = groupNotificationEvents(NOTIFICATION_EVENT_IDS);
    expect(layout.groups.map((group) => group.key)).toEqual([...EVENT_GROUP_KEYS]);
    const market = layout.groups.find((group) => group.key === 'market')!;
    expect(market.eventIds.at(-1)).toBe('priceAlertTriggered');
  });

  it('drops groups with no events, so a search that narrows to one event shows just that group', () => {
    const layout = groupNotificationEvents(['newMail', 'corpMemberJoined']);
    expect(layout.groups).toEqual([{ key: 'mailCalendar', eventIds: ['newMail'] }]);
    expect(layout.corp).toEqual(['corpMemberJoined']);
    expect(layout.eve).toBeNull();
  });
});
