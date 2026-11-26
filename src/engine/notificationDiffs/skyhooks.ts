export interface SkyhookEntrySnapshot {
  skyhookId: number;
  planetId: number;
  windowStartMs: number | null;
  windowEndMs: number | null;
  unsecuredUnits: number | null;
  leadMs: number;
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

export function siloAtRisk(entry: Pick<SkyhookEntrySnapshot, 'unsecuredUnits' | 'minUnits'>) {
  if (entry.unsecuredUnits === null) return true;
  return entry.unsecuredUnits > 0 && entry.unsecuredUnits >= entry.minUnits;
}

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
