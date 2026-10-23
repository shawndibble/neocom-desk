/**
 * The "raidable skyhook within N jumps" alert (issue #4784, raider half): fires
 * when a skyhook's theft window, read from the public raidable list, is open
 * or upcoming in a system within the pilot's chosen number of jumps of their
 * Current System, counted under Route Safety's route rules.
 *
 * Edge-triggered and once per skyhook per window: an entry is one window
 * (`systemId:planetId:startMs`), so the same window staying in range, or
 * leaving and returning, never fires twice, while the skyhook's next window
 * is a new occurrence. Frame handling is `diffIncursionNearby`'s: when the
 * origin system or N changes between polls the poll re-baselines silently.
 */
export interface SkyhookAlertEntry {
  systemId: number;
  planetId: number;
  startMs: number;
  endMs: number;
  /** Jumps from the Current System to the system; null when unreachable. */
  jumps: number | null;
  /** The Current System the jumps were counted from. */
  originSystemId: number;
  /** The pilot's N at the time of the poll. */
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
