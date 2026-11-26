import { EVENT_GROUP_KEYS, groupNotificationEvents } from './eventGroups';
import type { NotificationEventId } from './events';
import type { NotificationChannel } from './eventSelection';

export const TOPIC_IDS = [...EVENT_GROUP_KEYS, 'corp', 'eve'] as const;
export type TopicId = (typeof TOPIC_IDS)[number];

export interface Topic {
  id: TopicId;
  eventIds: readonly NotificationEventId[];
}

export function notificationTopics(ids: readonly NotificationEventId[]): Topic[] {
  const layout = groupNotificationEvents(ids);
  const topics: Topic[] = layout.groups.map((group) => ({
    id: group.key,
    eventIds: group.eventIds,
  }));
  if (layout.corp.length > 0) topics.push({ id: 'corp', eventIds: layout.corp });
  if (layout.eve !== null) topics.push({ id: 'eve', eventIds: [layout.eve] });
  return topics;
}

export interface TopicSummary {
  device: number;
  alerts: number;
  total: number;
  usable: boolean;
}

export function summarizeTopic(
  eventIds: readonly NotificationEventId[],
  characterIds: readonly number[],
  canUse: (eventId: NotificationEventId, characterId: number) => boolean,
  read: (eventId: NotificationEventId, characterId: number, channel: NotificationChannel) => boolean
): TopicSummary {
  let device = 0;
  let alerts = 0;
  let usable = false;
  for (const eventId of eventIds) {
    const applicable = characterIds.filter((id) => canUse(eventId, id));
    if (applicable.length === 0) continue;
    usable = true;
    if (applicable.some((id) => read(eventId, id, 'browser'))) device += 1;
    if (applicable.some((id) => read(eventId, id, 'feed'))) alerts += 1;
  }
  return { device, alerts, total: eventIds.length, usable };
}
