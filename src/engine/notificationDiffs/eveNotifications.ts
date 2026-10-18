export interface EveNotificationEntrySnapshot {
  notificationId: number;
  /**
   * ESI's own open-ended type enum (`AllWarDeclaredMsg`, `BillOutOfMoneyMsg`,
   * ...). Deliberately `string`, not a closed union — CCP adds types without
   * notice (issue #274, esi/esi-issues#1380), and a consumer that assumed a
   * closed enum breaks on an unrecognised one. This diff, and every consumer
   * of its fire, must render an unknown value generically rather than drop
   * or throw on it.
   */
  type: string;
  senderId: number;
  senderType: string;
  text: string;
  timestamp: string;
}

export interface EveNotificationSnapshot {
  entries: readonly EveNotificationEntrySnapshot[];
  nowMs: number;
}

export interface EveNotificationFire {
  eventId: 'eveNotification';
  characterId: number;
  notificationId: number;
  type: string;
  senderId: number;
  senderType: string;
  text: string;
  timestamp: string;
}

/**
 * Synthetic — never produced by a diff, never seen live. `projection.ts`'s
 * reinforcement-exit Projection (issue #359) reuses `notificationId` for its
 * own Occurrence Key derivation (`occurrenceKey.ts`) so it stays correlated
 * with the notification it was derived from, but under a distinct `eventId`
 * from the plain `EveNotificationFire` for the same id — a projected exit
 * and the live "lost shields/armor" fire are two different real-world
 * instants that happen to share one ESI `notification_id`, and reusing
 * `EveNotificationFire`'s key would let the later Feed upsert silently
 * overwrite the earlier one.
 */
export interface StructureReinforcementExitFire {
  eventId: 'structureReinforcementExit';
  characterId: number;
  notificationId: number;
}

/**
 * Fires per EVE-native notification id newly above the highest id seen in
 * `prev` (issue #274) — same high-water-mark reasoning as `diffNewMail`:
 * `getCharacterNotifications` returns a bounded recent window rather than
 * full history, so a plain set-difference would treat an older notification
 * newly paged in as new. `notification_id` is assigned sequentially by the
 * game server, so it is monotonically increasing the same way `mail_id` is.
 */
export function diffEveNotification(
  characterId: number,
  prev: EveNotificationSnapshot | undefined,
  next: EveNotificationSnapshot
): EveNotificationFire[] {
  if (!prev) return [];
  const maxPrevId = prev.entries.reduce((max, entry) => Math.max(max, entry.notificationId), 0);
  const fires: EveNotificationFire[] = [];
  for (const entry of next.entries) {
    if (entry.notificationId <= maxPrevId) continue;
    fires.push({
      eventId: 'eveNotification',
      characterId,
      notificationId: entry.notificationId,
      type: entry.type,
      senderId: entry.senderId,
      senderType: entry.senderType,
      text: entry.text,
      timestamp: entry.timestamp,
    });
  }
  return fires;
}
