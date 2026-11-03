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

/**
 * `acceleratorEnded`: a Character's cerebral accelerator stopped, by either
 * evidence the app has of one. Either the typed-in accelerator ran out
 * (`expired`), or the one detected from the attribute sheet (GLOSSARY.md
 * **Detected Accelerator**, no expiry ever typed) is no longer there (`lost`).
 *
 * One event for both, and one occurrence per Character per UTC day (see
 * `occurrenceKey`): the sheet usually refreshes a poll or two after the typed
 * expiry, and that second sighting is the same accelerator ending, not news.
 * Window-crossing like the diff above; fires nothing without a baseline.
 */
export interface AcceleratorPresenceEntry {
  kind: 'typed' | 'detected';
  bonus: number;
  /** Epoch ms a typed accelerator runs out; 0 for a detected one, which has none. */
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
  /** When it ended: the typed expiry for `expired`, the poll that missed it for `lost`. */
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
  // Over only by running out: the pilot deleting or replacing a still-running one is not it, but
  // a replacement typed in after the old one ran out (a different expiry) still ended it.
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
