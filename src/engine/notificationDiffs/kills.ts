/**
 * The ship-lost alert (issue #4772): one fire per loss killmail of a tracked
 * Character that the previous poll had not seen. zKillboard lists losses by
 * id and never edits one, so the baseline of ids seen is the whole identity —
 * no edge trigger needed.
 */
export interface ShipLossEntrySnapshot {
  killmailId: number;
  /** The killmail's own time, in epoch ms. */
  timeMs: number;
  /** The hull that died; absent when zKillboard sent only the hash. */
  shipTypeId?: number;
  systemId?: number;
  /** zKillboard's total value; absent when it states none. */
  value?: number;
  /** The Character's minimum-ISK setting as it stood when this poll ran — see `WalletJournalEntrySnapshot`. */
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

/**
 * Fires per loss id not in `prev`, oldest first. No baseline fires nothing:
 * the first poll after enabling the event seeds it. A loss under the minimum
 * is dropped for good, since the next baseline holds it. With a minimum set, a
 * loss with no stated value is dropped too: it cannot be shown to reach it.
 */
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
