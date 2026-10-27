/**
 * Mercenary Den events (issue #4782). Dens are read per Character (ESI has no
 * corporation den route), so both events are per-Character.
 *
 * `mercenaryDenReinforced` has two phases of one countdown: `soon`, when the
 * reinforcement exit enters the Character's lead window, and `out`, when the
 * exit passes. `mercenaryDenAnarchy` is an edge: anarchy reaching the
 * Character's threshold %. Both fire nothing on the first poll, which seeds
 * the baseline. As in `diffStructureFuelLow`, each side of a comparison is
 * judged by the threshold in force when it was measured, so a Settings change
 * takes effect on the very next poll in both directions.
 */
export interface DenEntrySnapshot {
  denId: number;
  planetId: number;
  /** The reinforcement exit in epoch ms; null when the den is not reinforced. */
  reinforcedUntilMs: number | null;
  /** 0–100 within the level; null when the den's detail could not be read. */
  anarchyAmount: number | null;
  anarchyLevel: number | null;
  /** The Character's reinforce lead time as it stood when this poll ran. */
  leadMs: number;
  /** The Character's anarchy threshold (%) as it stood when this poll ran. */
  anarchyPct: number;
}

export interface DenSnapshot {
  entries: readonly DenEntrySnapshot[];
  nowMs: number;
}

export interface MercenaryDenReinforcedFire {
  eventId: 'mercenaryDenReinforced';
  characterId: number;
  denId: number;
  planetId: number;
  reinforcedUntilMs: number;
  thresholdMs: number;
  /** `soon`: inside the lead window; `out`: the exit has passed. */
  phase: 'soon' | 'out';
}

export interface MercenaryDenAnarchyFire {
  eventId: 'mercenaryDenAnarchy';
  characterId: number;
  denId: number;
  planetId: number;
  anarchyAmount: number;
  thresholdPct: number;
}

/**
 * `soon` per (den, exit) the first poll it is inside its lead window; `out`
 * per exit that passed between two polls and left the den out (an extended
 * exit, or a den whose detail could not be read, is not out). A refreshed reinforcement has a
 * new exit instant, so it is a new countdown and fires again. A den gone from
 * the list after its exit still counts as out.
 */
export function diffMercenaryDenReinforced(
  characterId: number,
  prev: DenSnapshot | undefined,
  next: DenSnapshot
): MercenaryDenReinforcedFire[] {
  if (!prev) return [];
  const prevById = new Map(prev.entries.map((entry) => [entry.denId, entry]));
  const fires: MercenaryDenReinforcedFire[] = [];

  for (const entry of next.entries) {
    const end = entry.reinforcedUntilMs;
    if (end === null) continue;
    const remaining = end - next.nowMs;
    if (remaining <= 0 || remaining > entry.leadMs) continue;
    const before = prevById.get(entry.denId);
    if (before && before.reinforcedUntilMs === end) {
      const remainingBefore = end - prev.nowMs;
      if (remainingBefore > 0 && remainingBefore <= before.leadMs) continue;
    }
    fires.push({
      eventId: 'mercenaryDenReinforced',
      characterId,
      denId: entry.denId,
      planetId: entry.planetId,
      reinforcedUntilMs: end,
      thresholdMs: entry.leadMs,
      phase: 'soon',
    });
  }

  const nextById = new Map(next.entries.map((entry) => [entry.denId, entry]));
  for (const before of prev.entries) {
    const end = before.reinforcedUntilMs;
    if (end === null || end <= prev.nowMs || end > next.nowMs) continue;
    const now = nextById.get(before.denId);
    // Still reinforced (the exit was extended), or unread this poll: not out.
    if (now && now.reinforcedUntilMs !== null && now.reinforcedUntilMs > next.nowMs) continue;
    if (now && now.reinforcedUntilMs === null && now.anarchyAmount === null) continue;
    fires.push({
      eventId: 'mercenaryDenReinforced',
      characterId,
      denId: before.denId,
      planetId: before.planetId,
      reinforcedUntilMs: end,
      thresholdMs: before.leadMs,
      phase: 'out',
    });
  }
  return fires;
}

/**
 * One fire per den whose anarchy is at or past its threshold now and was not
 * at the previous poll. A den new to this poll counts as not previously
 * above; a den whose previous read was blank is unknown, so it stays quiet
 * rather than announce a level that may have stood for days. A level change
 * re-arms, since the amount restarts within each level.
 */
export function diffMercenaryDenAnarchy(
  characterId: number,
  prev: DenSnapshot | undefined,
  next: DenSnapshot
): MercenaryDenAnarchyFire[] {
  if (!prev) return [];
  const prevById = new Map(prev.entries.map((entry) => [entry.denId, entry]));
  const fires: MercenaryDenAnarchyFire[] = [];
  for (const entry of next.entries) {
    if (entry.anarchyAmount === null || entry.anarchyAmount < entry.anarchyPct) continue;
    const before = prevById.get(entry.denId);
    if (before) {
      if (before.anarchyAmount === null) continue;
      const wasAbove =
        before.anarchyAmount >= before.anarchyPct && before.anarchyLevel === entry.anarchyLevel;
      if (wasAbove) continue;
    }
    fires.push({
      eventId: 'mercenaryDenAnarchy',
      characterId,
      denId: entry.denId,
      planetId: entry.planetId,
      anarchyAmount: entry.anarchyAmount,
      thresholdPct: entry.anarchyPct,
    });
  }
  return fires;
}
