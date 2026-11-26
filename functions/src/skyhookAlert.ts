export interface SkyhookAlertEntry {
  systemId: number;
  planetId: number;
  startMs: number;
  endMs: number;
  jumps: number | null;
  originSystemId: number;
  withinJumps: number;
}

export interface SkyhookAlertSnapshot {
  entries: readonly SkyhookAlertEntry[];
  nowMs: number;
}

export interface SkyhookRaidableNearbyFire {
  eventId: 'skyhookRaidableNearby';
  characterId: number;
  systemId: number;
  planetId: number;
  startMs: number;
  endMs: number;
  jumps: number;
}

function inRange(entry: SkyhookAlertEntry): entry is SkyhookAlertEntry & { jumps: number } {
  return entry.jumps !== null && entry.jumps <= entry.withinJumps;
}

const frameOf = (entry: SkyhookAlertEntry) => `${entry.originSystemId}:${entry.withinJumps}`;
const windowKey = (entry: SkyhookAlertEntry) =>
  `${entry.systemId}:${entry.planetId}:${entry.startMs}`;

export function diffSkyhookRaidableNearby(
  characterId: number,
  prev: SkyhookAlertSnapshot | undefined,
  next: SkyhookAlertSnapshot
): SkyhookRaidableNearbyFire[] {
  if (!prev) return [];
  const prevFrame = prev.entries[0] === undefined ? null : frameOf(prev.entries[0]);
  const before = new Map(prev.entries.map((entry) => [windowKey(entry), entry]));
  const fires: SkyhookRaidableNearbyFire[] = [];
  for (const entry of next.entries) {
    if (!inRange(entry) || entry.endMs <= next.nowMs) continue;
    if (prevFrame !== null && prevFrame !== frameOf(entry)) continue;
    const seen = before.get(windowKey(entry));
    if (seen !== undefined && inRange(seen)) continue;
    fires.push({
      eventId: 'skyhookRaidableNearby',
      characterId,
      systemId: entry.systemId,
      planetId: entry.planetId,
      startMs: entry.startMs,
      endMs: entry.endMs,
      jumps: entry.jumps,
    });
  }
  return fires;
}
