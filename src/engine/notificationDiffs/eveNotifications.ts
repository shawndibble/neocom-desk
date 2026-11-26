export interface EveNotificationEntrySnapshot {
  notificationId: number;
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

export interface StructureReinforcementExitFire {
  eventId: 'structureReinforcementExit';
  characterId: number;
  notificationId: number;
}

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
