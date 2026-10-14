// Push payloads for server-polled EVE notifications (issue #3756, ADR 0020).
// Pure. The raw notification goes out (id, type, timestamp, size-capped text);
// no rendered copy beyond a generic title/body, because this package has no SDE
// or i18n catalog. The generic title/body keep today's service worker
// (`pushHandler.ts`'s `parsePushPayload`, which requires both) working until it
// renders the raw fields itself.

import type { EsiNotification } from './eveNotificationSelection.js';

/** More pushable notifications than this for one device and Character collapse into one summary push. */
export const SUMMARY_THRESHOLD = 3;

/** Keeps one FCM data message well under its 4 KB cap. */
export const MAX_TEXT_CHARS = 1500;

export interface PushMessage {
  data: Record<string, string>;
  /** Web Push `Topic`: a newer push with the same topic replaces an undelivered older one. */
  collapseKey?: string;
}

/**
 * The Occurrence Key the Foreground Poller derives for the same notification
 * (`src/engine/occurrenceKey.ts`: `[characterId, 'eveNotification',
 * notificationId].join(':')`). A test pins the two together.
 */
export function eveNotificationOccurrenceKey(characterId: number, notificationId: number): string {
  return `${characterId}:eveNotification:${notificationId}`;
}

function singlePush(characterId: number, n: EsiNotification): PushMessage {
  const sentAt = Date.parse(n.timestamp);
  return {
    data: {
      characterId: String(characterId),
      eventId: 'eveNotification',
      occurrenceKey: eveNotificationOccurrenceKey(characterId, n.notification_id),
      title: 'EVE notification',
      body: n.type,
      fireAt: String(sentAt),
      eveType: n.type,
      notificationId: String(n.notification_id),
      notificationTimestamp: n.timestamp,
      notificationText: (n.text ?? '').slice(0, MAX_TEXT_CHARS),
    },
  };
}

function summaryPush(characterId: number, list: readonly EsiNotification[]): PushMessage {
  const newest = list.reduce((a, b) => (b.notification_id > a.notification_id ? b : a));
  const sentAt = Date.parse(newest.timestamp);
  return {
    data: {
      characterId: String(characterId),
      eventId: 'eveNotification',
      occurrenceKey: `${characterId}:eveNotification:summary:${newest.notification_id}`,
      title: 'New EVE notifications',
      body: `${list.length} new EVE notifications`,
      fireAt: String(sentAt),
      summaryCount: String(list.length),
    },
    collapseKey: `eve-${characterId}`,
  };
}

/** One push each, or one summary push when there are more than `SUMMARY_THRESHOLD`. */
export function buildPushes(
  characterId: number,
  list: readonly EsiNotification[],
  threshold: number = SUMMARY_THRESHOLD
): PushMessage[] {
  if (list.length === 0) return [];
  if (list.length > threshold) return [summaryPush(characterId, list)];
  return list.map((n) => singlePush(characterId, n));
}
