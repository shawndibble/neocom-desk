export interface ShipLossEntrySnapshot {
  killmailId: number;
  timeMs: number;
  shipTypeId?: number;
  systemId?: number;
  value?: number;
  thresholdIsk: number;
}

export interface ShipLossSnapshot {
  entries: readonly ShipLossEntrySnapshot[];
  nowMs: number;
}

export interface ShipLostFire {
  eventId: 'shipLost';
  characterId: number;
  killmailId: number;
  timeMs: number;
  shipTypeId?: number;
  systemId?: number;
  value?: number;
}

export function diffShipLost(
  characterId: number,
  prev: ShipLossSnapshot | undefined,
  next: ShipLossSnapshot
): ShipLostFire[] {
  if (!prev) return [];
  const seen = new Set(prev.entries.map((entry) => entry.killmailId));
  return next.entries
    .filter((entry) => !seen.has(entry.killmailId))
    .filter((entry) => entry.thresholdIsk <= 0 || (entry.value ?? -1) >= entry.thresholdIsk)
    .sort((a, b) => a.killmailId - b.killmailId)
    .map((entry) => ({
      eventId: 'shipLost' as const,
      characterId,
      killmailId: entry.killmailId,
      timeMs: entry.timeMs,
      ...(entry.shipTypeId !== undefined ? { shipTypeId: entry.shipTypeId } : {}),
      ...(entry.systemId !== undefined ? { systemId: entry.systemId } : {}),
      ...(entry.value !== undefined ? { value: entry.value } : {}),
    }));
}
