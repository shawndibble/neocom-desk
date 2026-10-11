/**
 * The "Incursion within N jumps" alert (issue #3542): fires when an Incursion
 * comes within the pilot's chosen number of jumps of their Current System,
 * counted under Route Safety's route rules.
 *
 * Edge-triggered like `diffStockBelowTarget`, keyed on the constellation: an
 * Incursion staying in range, moving on from mobilizing to established,
 * moving out of range or withdrawing never fires again. Unlike stock, an
 * Incursion with no counterpart in the previous poll does fire — a new spawn
 * already in range is exactly what the alert is for.
 *
 * Each entry carries the frame it was counted in: the origin system and N.
 * When either changes between polls, the poll re-baselines silently, so
 * raising N or moving system never fires a burst for Incursions that were
 * already near. A side effect, recorded as a scope decision: flying towards
 * an Incursion changes the origin, so it does not alert either.
 */
import type { IncursionState } from './incursionRows';

export interface IncursionAlertEntry {
  constellationId: number;
  stagingSystemId: number;
  state: IncursionState;
  /** Jumps from the Current System to the staging system; null when unreachable. */
  jumps: number | null;
  /** The Current System the jumps were counted from. */
  originSystemId: number;
  /** The pilot's N at the time of the poll. */
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
