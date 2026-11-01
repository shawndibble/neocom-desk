/**
 * `acceleratorExpiring`: a Character's typed-in cerebral accelerator is about
 * to run out (GLOSSARY.md **Accelerator**). No ESI is involved: the entry
 * comes from the pilot's own answer (`characterAccelerators` in Dexie), so a
 * Character with none, or one that has already expired, has no entry at all.
 *
 * Window-crossing, on `diffMercenaryDenReinforced`'s precedent: each side of
 * the comparison is judged by the lead time in force when it was measured, so
 * a Settings change takes effect on the very next poll. An entry's identity
 * for "observed before" is its own `expiresAtMs`; the pilot swapping in a
 * fresh accelerator (new expiry) is a new countdown and fires again.
 */
export interface AcceleratorEntrySnapshot {
  /** Epoch ms the typed-in accelerator runs out. */
  expiresAtMs: number;
  bonus: number;
  /** The Character's `acceleratorExpiringLeadHours`, in ms, as it stood when this poll ran. */
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

/** Fires nothing without a baseline; a first poll only seeds it. */
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
