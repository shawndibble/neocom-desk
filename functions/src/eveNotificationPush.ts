import type { EsiNotification } from './eveNotificationSelection.js';

export const SUMMARY_THRESHOLD = 3;

export const MAX_TEXT_BYTES = 2500;

export function capUtf8(text: string, maxBytes: number): string {
  let bytes = 0;
  let out = '';
  for (const ch of text) {
    bytes += Buffer.byteLength(ch);
    if (bytes > maxBytes) break;
    out += ch;
  }
  return out;
}

export interface PushMessage {
  data: Record<string, string>;
  collapseKey?: string;
}

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
      notificationText: capUtf8(n.text ?? '', MAX_TEXT_BYTES),
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

export function buildPushes(characterId: number, list: readonly EsiNotification[]): PushMessage[] {
  if (list.length === 0) return [];
  if (list.length > SUMMARY_THRESHOLD) return [summaryPush(characterId, list)];
  return list.map((n) => singlePush(characterId, n));
}
