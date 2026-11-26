import type { IncursionState } from './incursionState.js';

export interface IncursionAlertEntry {
  constellationId: number;
  stagingSystemId: number;
  state: IncursionState;
  jumps: number | null;
  originSystemId: number;
  withinJumps: number;
}

export interface IncursionAlertSnapshot {
  entries: readonly IncursionAlertEntry[];
  nowMs: number;
}

export interface IncursionNearbyFire {
  eventId: 'incursionNearby';
  characterId: number;
  constellationId: number;
  stagingSystemId: number;
  state: IncursionState;
  jumps: number;
}

function inRange(entry: IncursionAlertEntry): entry is IncursionAlertEntry & { jumps: number } {
  return entry.jumps !== null && entry.jumps <= entry.withinJumps;
}

const frameOf = (entry: IncursionAlertEntry) => `${entry.originSystemId}:${entry.withinJumps}`;

export function diffIncursionNearby(
  characterId: number,
  prev: IncursionAlertSnapshot | undefined,
  next: IncursionAlertSnapshot
): IncursionNearbyFire[] {
  if (!prev) return [];
  const prevFrame = prev.entries[0] === undefined ? null : frameOf(prev.entries[0]);
  const prevByConstellation = new Map(prev.entries.map((entry) => [entry.constellationId, entry]));
  const fires: IncursionNearbyFire[] = [];
  for (const entry of next.entries) {
    if (entry.state === 'withdrawing' || !inRange(entry)) continue;
    if (prevFrame !== null && prevFrame !== frameOf(entry)) continue;
    const before = prevByConstellation.get(entry.constellationId);
    if (before !== undefined && inRange(before)) continue;
    fires.push({
      eventId: 'incursionNearby',
      characterId,
      constellationId: entry.constellationId,
      stagingSystemId: entry.stagingSystemId,
      state: entry.state,
      jumps: entry.jumps,
    });
  }
  return fires;
}
