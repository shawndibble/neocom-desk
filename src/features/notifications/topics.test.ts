import { describe, expect, it } from 'vitest';
import { NOTIFICATION_EVENT_IDS } from './events';
import { notificationTopics, summarizeTopic, TOPIC_IDS } from './topics';

describe('notificationTopics', () => {
  it('files every catalog event under exactly one topic, in a fixed order', () => {
    const topics = notificationTopics(NOTIFICATION_EVENT_IDS);
    expect(topics.map((topic) => topic.id)).toEqual([...TOPIC_IDS]);
    const all = topics.flatMap((topic) => topic.eventIds);
    expect([...all].sort()).toEqual([...NOTIFICATION_EVENT_IDS].sort());
  });

  it('drops topics a search leaves empty', () => {
    const topics = notificationTopics(['newMail', 'eveNotification']);
    expect(topics.map((topic) => topic.id)).toEqual(['mailCalendar', 'eve']);
  });
});

describe('summarizeTopic', () => {
  const usable = () => true;

  it('counts events with a channel on for at least one usable character', () => {
    const summary = summarizeTopic(
      ['newMail', 'newCalendarEvent', 'calendarEventStarting'],
      [1, 2],
      usable,
      (eventId, characterId, channel) =>
        channel === 'feed' || (eventId === 'newMail' && characterId === 2)
    );
    expect(summary).toEqual({ device: 1, alerts: 3, total: 3, usable: true });
  });

  it('is not usable when no character can use any event of the topic', () => {
    const summary = summarizeTopic(
      ['corpMemberJoined'],
      [1],
      () => false,
      () => true
    );
    expect(summary.usable).toBe(false);
    expect(summary.device).toBe(0);
    expect(summary.alerts).toBe(0);
  });

  it('ignores the value a character holds for an event it cannot use', () => {
    const summary = summarizeTopic(
      ['newMail'],
      [1, 2],
      (_eventId, characterId) => characterId === 1,
      (_eventId, characterId) => characterId === 2
    );
    expect(summary).toEqual({ device: 0, alerts: 0, total: 1, usable: true });
  });
});
