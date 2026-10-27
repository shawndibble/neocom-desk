/**
 * The defender's skyhook raid alert (issue #4784, part A). A skyhook's theft
 * window is a known timestamp, so one event carries three phases:
 *
 * - `soon`: the window's opening enters the Character's lead time (plain Alert).
 * - `open`: the window has opened and the silo is below the Character's
 *   minimum (plain Alert).
 * - `danger`: the window has opened and the silo is at or above that minimum,
 *   or could not be read, so the Danger banner shows it (`alertGroups.ts`
 *   reads the `:danger` Occurrence Key suffix).
 *
 * ESI sends no silo capacity (`corpSovereigntyModels.ts`), so "silo" is the
 * unsecured stock a raid takes, in units, not a percent. Nothing fires on the
 * first poll, which seeds the baseline. As in `diffMercenaryDenReinforced`,
 * each side of a comparison is judged by the lead time in force when it was
 * measured.
 */
export interface SkyhookEntrySnapshot {
  skyhookId: number;
  planetId: number;
  /** The theft window in epoch ms; null when ESI sent no window (not raidable). */
  windowStartMs: number | null;
  windowEndMs: number | null;
  /** Unsecured reagent units a raid would take; null when the stock could not be read. */
  unsecuredUnits: number | null;
  /** The Character's lead time as it stood when this poll ran. */
  leadMs: number;
  /** The Character's minimum unsecured units for a danger Alert, as of this poll. */
  minUnits: number;
}

export interface SkyhookSnapshot {
  entries: readonly SkyhookEntrySnapshot[];
  nowMs: number;
}

export type SkyhookRaidPhase = 'soon' | 'open' | 'danger';

export interface SkyhookRaidableFire {
  eventId: 'skyhookRaidable';
  characterId: number;
  skyhookId: number;
  planetId: number;
  windowStartMs: number;
  windowEndMs: number;
  thresholdMs: number;
  unsecuredUnits: number | null;
  phase: SkyhookRaidPhase;
}

/**
 * Unread, or holding some stock at or above the minimum. An unknown stock is never
 * called safe; an empty silo always is, since a raid has nothing to take from it.
 */
export function siloAtRisk(entry: Pick<SkyhookEntrySnapshot, 'unsecuredUnits' | 'minUnits'>) {
  if (entry.unsecuredUnits === null) return true;
  return entry.unsecuredUnits > 0 && entry.unsecuredUnits >= entry.minUnits;
}

/** The phase a window that is open at the snapshot's instant reports. */
export function openPhase(entry: SkyhookEntrySnapshot): 'open' | 'danger' {
  return siloAtRisk(entry) ? 'danger' : 'open';
}

function windowOf(entry: SkyhookEntrySnapshot): { start: number; end: number } | null {
  return entry.windowStartMs === null || entry.windowEndMs === null
    ? null
    : { start: entry.windowStartMs, end: entry.windowEndMs };
}

function inLead(entry: SkyhookEntrySnapshot, nowMs: number): boolean {
  const window = windowOf(entry);
  if (window === null) return false;
  const remaining = window.start - nowMs;
  return remaining > 0 && remaining <= entry.leadMs;
}

function isOpen(entry: SkyhookEntrySnapshot, nowMs: number): boolean {
  const window = windowOf(entry);
  return window !== null && window.start <= nowMs && nowMs < window.end;
}

export function diffSkyhookRaidable(
  characterId: number,
  prev: SkyhookSnapshot | undefined,
  next: SkyhookSnapshot
): SkyhookRaidableFire[] {
  if (!prev) return [];
  const prevById = new Map(prev.entries.map((entry) => [entry.skyhookId, entry]));
  const fires: SkyhookRaidableFire[] = [];
  for (const entry of next.entries) {
    const window = windowOf(entry);
    if (window === null) continue;
    const before = prevById.get(entry.skyhookId);
    // The same window as last poll: a changed window is a new countdown.
    const sameWindow = before !== undefined && before.windowStartMs === entry.windowStartMs;
    const base = {
      eventId: 'skyhookRaidable' as const,
      characterId,
      skyhookId: entry.skyhookId,
      planetId: entry.planetId,
      windowStartMs: window.start,
      windowEndMs: window.end,
      thresholdMs: entry.leadMs,
      unsecuredUnits: entry.unsecuredUnits,
    };
    if (inLead(entry, next.nowMs)) {
      if (!(sameWindow && inLead(before, prev.nowMs))) fires.push({ ...base, phase: 'soon' });
    } else if (isOpen(entry, next.nowMs)) {
      if (!(sameWindow && isOpen(before, prev.nowMs))) {
        fires.push({ ...base, phase: openPhase(entry) });
      }
    }
  }
  return fires;
}
