export interface AcceleratorEntrySnapshot {
  expiresAtMs: number;
  bonus: number;
  leadMs: number;
}

export interface AcceleratorSnapshot {
  entries: readonly AcceleratorEntrySnapshot[];
  nowMs: number;
}

export interface AcceleratorExpiringFire {
  eventId: 'acceleratorExpiring';
  characterId: number;
  expiresAtMs: number;
  bonus: number;
  thresholdMs: number;
}

export function diffAcceleratorExpiring(
  characterId: number,
  prev: AcceleratorSnapshot | undefined,
  next: AcceleratorSnapshot
): AcceleratorExpiringFire[] {
  if (!prev) return [];
  const fires: AcceleratorExpiringFire[] = [];
  for (const entry of next.entries) {
    const remaining = entry.expiresAtMs - next.nowMs;
    if (remaining <= 0 || remaining > entry.leadMs) continue;
    const before = prev.entries.find((candidate) => candidate.expiresAtMs === entry.expiresAtMs);
    if (before) {
      const remainingBefore = entry.expiresAtMs - prev.nowMs;
      if (remainingBefore > 0 && remainingBefore <= before.leadMs) continue;
    }
    fires.push({
      eventId: 'acceleratorExpiring',
      characterId,
      expiresAtMs: entry.expiresAtMs,
      bonus: entry.bonus,
      thresholdMs: entry.leadMs,
    });
  }
  return fires;
}

export interface AcceleratorPresenceEntry {
  kind: 'typed' | 'detected';
  bonus: number;
  expiresAtMs: number;
}

export interface AcceleratorPresenceSnapshot {
  entries: readonly AcceleratorPresenceEntry[];
  nowMs: number;
}

export interface AcceleratorEndedFire {
  eventId: 'acceleratorEnded';
  characterId: number;
  kind: 'expired' | 'lost';
  bonus: number;
  atMs: number;
}

export function diffAcceleratorEnded(
  characterId: number,
  prev: AcceleratorPresenceSnapshot | undefined,
  next: AcceleratorPresenceSnapshot
): AcceleratorEndedFire[] {
  if (!prev) return [];
  const pick = (snapshot: AcceleratorPresenceSnapshot, kind: AcceleratorPresenceEntry['kind']) =>
    snapshot.entries.find((entry) => entry.kind === kind);
  const typedBefore = pick(prev, 'typed');
  if (
    typedBefore &&
    typedBefore.expiresAtMs <= next.nowMs &&
    pick(next, 'typed')?.expiresAtMs !== typedBefore.expiresAtMs
  ) {
    return [
      {
        eventId: 'acceleratorEnded',
        characterId,
        kind: 'expired',
        bonus: typedBefore.bonus,
        atMs: typedBefore.expiresAtMs,
      },
    ];
  }
  const detectedBefore = pick(prev, 'detected');
  if (detectedBefore && !pick(next, 'detected') && !pick(next, 'typed')) {
    return [
      {
        eventId: 'acceleratorEnded',
        characterId,
        kind: 'lost',
        bonus: detectedBefore.bonus,
        atMs: next.nowMs,
      },
    ];
  }
  return [];
}
