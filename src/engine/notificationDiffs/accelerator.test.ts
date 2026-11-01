import { describe, expect, it } from 'vitest';
import {
  diffAcceleratorExpiring,
  type AcceleratorEntrySnapshot,
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
