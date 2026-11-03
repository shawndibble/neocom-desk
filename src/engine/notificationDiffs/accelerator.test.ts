import { describe, expect, it } from 'vitest';
import { occurrenceKey } from '../occurrenceKey';
import {
  diffAcceleratorEnded,
  diffAcceleratorExpiring,
  type AcceleratorEntrySnapshot,
  type AcceleratorPresenceEntry,
  type AcceleratorSnapshot,
} from './accelerator';

const HOUR = 3_600_000;
const NOW = 1_000_000_000_000;

function entry(overrides: Partial<AcceleratorEntrySnapshot> = {}): AcceleratorEntrySnapshot {
  return { expiresAtMs: NOW + 3 * HOUR, bonus: 10, leadMs: HOUR, ...overrides };
}

function snap(nowMs: number, ...entries: AcceleratorEntrySnapshot[]): AcceleratorSnapshot {
  return { entries, nowMs };
}

describe('diffAcceleratorExpiring', () => {
  it('fires nothing without a baseline', () => {
    expect(
      diffAcceleratorExpiring(7, undefined, snap(NOW, entry({ expiresAtMs: NOW + 1 })))
    ).toEqual([]);
  });

  it('fires once when the expiry enters the lead window, not again inside it', () => {
    const before = snap(NOW, entry());
    const inside = snap(NOW + 2.5 * HOUR, entry());
    const later = snap(NOW + 2.75 * HOUR, entry());
    expect(diffAcceleratorExpiring(7, before, inside)).toEqual([
      {
        eventId: 'acceleratorExpiring',
        characterId: 7,
        expiresAtMs: NOW + 3 * HOUR,
        bonus: 10,
        thresholdMs: HOUR,
      },
    ]);
    expect(diffAcceleratorExpiring(7, inside, later)).toEqual([]);
  });

  it('fires when the record first appears already inside the window', () => {
    const fires = diffAcceleratorExpiring(
      7,
      snap(NOW),
      snap(NOW + HOUR, entry({ expiresAtMs: NOW + HOUR + 30 * 60_000 }))
    );
    expect(fires).toHaveLength(1);
  });

  it('fires nothing outside the window, for an expired record, or for none', () => {
    expect(diffAcceleratorExpiring(7, snap(NOW), snap(NOW + HOUR, entry()))).toEqual([]);
    expect(diffAcceleratorExpiring(7, snap(NOW, entry()), snap(NOW + 4 * HOUR, entry()))).toEqual(
      []
    );
    expect(diffAcceleratorExpiring(7, snap(NOW, entry()), snap(NOW + HOUR))).toEqual([]);
  });

  it('fires again for a replaced accelerator (new expiry)', () => {
    const prev = snap(NOW + 2.5 * HOUR, entry());
    const next = snap(NOW + 2.6 * HOUR, entry({ expiresAtMs: NOW + 3.4 * HOUR }));
    expect(diffAcceleratorExpiring(7, prev, next)).toHaveLength(1);
  });

  it('takes a raised lead time effect on the next poll', () => {
    const prev = snap(NOW + 1.5 * HOUR, entry({ leadMs: HOUR }));
    const next = snap(NOW + 1.6 * HOUR, entry({ leadMs: 2 * HOUR }));
    expect(diffAcceleratorExpiring(7, prev, next)).toHaveLength(1);
  });
});

describe('diffAcceleratorEnded', () => {
  const typed = (expiresAtMs: number, bonus = 12): AcceleratorPresenceEntry => ({
    kind: 'typed',
    bonus,
    expiresAtMs,
  });
  const detected = (bonus = 12): AcceleratorPresenceEntry => ({
    kind: 'detected',
    bonus,
    expiresAtMs: 0,
  });
  const presence = (nowMs: number, ...entries: AcceleratorPresenceEntry[]) => ({
    entries,
    nowMs,
  });

  it('fires nothing without a baseline', () => {
    expect(diffAcceleratorEnded(7, undefined, presence(NOW))).toEqual([]);
  });

  it('fires expired once a typed accelerator has run out, and only once', () => {
    const before = presence(NOW, typed(NOW + HOUR));
    const after = presence(NOW + 2 * HOUR, detected());
    expect(diffAcceleratorEnded(7, before, after)).toEqual([
      { eventId: 'acceleratorEnded', characterId: 7, kind: 'expired', bonus: 12, atMs: NOW + HOUR },
    ]);
    expect(diffAcceleratorEnded(7, after, presence(NOW + 3 * HOUR, detected()))).toEqual([]);
  });

  it('does not fire when the pilot deletes or replaces a typed accelerator that was still running', () => {
    const before = presence(NOW, typed(NOW + 5 * HOUR));
    expect(diffAcceleratorEnded(7, before, presence(NOW + HOUR))).toEqual([]);
    expect(diffAcceleratorEnded(7, before, presence(NOW + HOUR, typed(NOW + 9 * HOUR)))).toEqual(
      []
    );
  });

  it('still fires expired when a replacement is typed in after the old one ran out', () => {
    const before = presence(NOW, typed(NOW + HOUR));
    const after = presence(NOW + 2 * HOUR, typed(NOW + 9 * HOUR));
    expect(diffAcceleratorEnded(7, before, after)).toHaveLength(1);
    expect(diffAcceleratorEnded(7, after, presence(NOW + 3 * HOUR, typed(NOW + 9 * HOUR)))).toEqual(
      []
    );
  });

  it('fires lost when a detected accelerator goes away with no typed one', () => {
    expect(diffAcceleratorEnded(7, presence(NOW, detected(8)), presence(NOW + HOUR))).toEqual([
      { eventId: 'acceleratorEnded', characterId: 7, kind: 'lost', bonus: 8, atMs: NOW + HOUR },
    ]);
  });

  it('does not fire lost while a typed accelerator is running, or while detection still sees one', () => {
    const before = presence(NOW, detected());
    expect(diffAcceleratorEnded(7, before, presence(NOW + HOUR, typed(NOW + 9 * HOUR)))).toEqual(
      []
    );
    expect(diffAcceleratorEnded(7, before, presence(NOW + HOUR, detected()))).toEqual([]);
  });

  it('announces a typed expiry once even when the attribute sheet drops it a poll later', () => {
    const typedLive = presence(NOW, typed(NOW + HOUR), detected());
    const expired = presence(NOW + 2 * HOUR, detected());
    const sheetCaughtUp = presence(NOW + 3 * HOUR);
    const first = diffAcceleratorEnded(7, typedLive, expired);
    const second = diffAcceleratorEnded(7, expired, sheetCaughtUp);
    expect(first).toHaveLength(1);
    // Two fires, but one occurrence: the key is per Character per UTC day.
    const keys = [...first, ...second].map((fire) => occurrenceKey(fire, NOW + 3 * HOUR));
    expect(new Set(keys).size).toBe(1);
  });
});
