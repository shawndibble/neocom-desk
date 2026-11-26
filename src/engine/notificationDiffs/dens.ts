export interface DenEntrySnapshot {
  denId: number;
  planetId: number;
  reinforcedUntilMs: number | null;
  anarchyAmount: number | null;
  anarchyLevel: number | null;
  leadMs: number;
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
