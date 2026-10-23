import { describe, expect, it } from 'vitest';
import {
  diffMercenaryDenAnarchy,
  diffMercenaryDenReinforced,
  type DenEntrySnapshot,
  type DenSnapshot,
} from './dens';

const HOUR = 3_600_000;
const NOW = 1_000_000_000_000;

function den(overrides: Partial<DenEntrySnapshot> = {}): DenEntrySnapshot {
  return {
    denId: 1,
    planetId: 40_000_001,
    reinforcedUntilMs: null,
    anarchyAmount: 10,
    anarchyLevel: 1,
    leadMs: HOUR,
    anarchyPct: 50,
    ...overrides,
  };
}

function snap(nowMs: number, ...entries: DenEntrySnapshot[]): DenSnapshot {
  return { entries, nowMs };
}

describe('diffMercenaryDenReinforced', () => {
  it('fires nothing without a baseline', () => {
    const next = snap(NOW, den({ reinforcedUntilMs: NOW + 30 * 60_000 }));
    expect(diffMercenaryDenReinforced(7, undefined, next)).toEqual([]);
  });

  it('fires once when the exit crosses into the lead window, not again inside it', () => {
    const end = NOW + 3 * HOUR;
    const before = snap(NOW, den({ reinforcedUntilMs: end }));
    const inside = snap(NOW + 2.5 * HOUR, den({ reinforcedUntilMs: end }));
    const later = snap(NOW + 2.75 * HOUR, den({ reinforcedUntilMs: end }));
    const fires = diffMercenaryDenReinforced(7, before, inside);
    expect(fires).toEqual([
      {
        eventId: 'mercenaryDenReinforced',
        characterId: 7,
        denId: 1,
        planetId: 40_000_001,
        reinforcedUntilMs: end,
        thresholdMs: HOUR,
        phase: 'soon',
      },
    ]);
    expect(diffMercenaryDenReinforced(7, inside, later)).toEqual([]);
  });

  it('fires once for a den first seen already inside the window', () => {
    const end = NOW + 30 * 60_000;
    const fires = diffMercenaryDenReinforced(
      7,
      snap(NOW),
      snap(NOW, den({ reinforcedUntilMs: end }))
    );
    expect(fires.map((f) => f.phase)).toEqual(['soon']);
  });

  it('judges each side by the lead time in force when it was measured', () => {
    const end = NOW + 3 * HOUR;
    const prev = snap(NOW, den({ reinforcedUntilMs: end, leadMs: HOUR }));
    const raised = snap(NOW + 1000, den({ reinforcedUntilMs: end, leadMs: 6 * HOUR }));
    expect(diffMercenaryDenReinforced(7, prev, raised).map((f) => f.phase)).toEqual(['soon']);
  });

  it('fires "out" once when the exit passes, and not for a den first seen already out', () => {
    const end = NOW + 10 * 60_000;
    const prev = snap(NOW, den({ reinforcedUntilMs: end }));
    const out = snap(end + 60_000, den({ reinforcedUntilMs: null }));
    const fires = diffMercenaryDenReinforced(7, prev, out);
    expect(fires).toEqual([
      expect.objectContaining({ phase: 'out', denId: 1, reinforcedUntilMs: end }),
    ]);
    expect(diffMercenaryDenReinforced(7, out, snap(end + 120_000, den()))).toEqual([]);
    expect(
      diffMercenaryDenReinforced(7, snap(end + 1), snap(end + 2, den({ reinforcedUntilMs: end })))
    ).toEqual([]);
  });

  it('is not out when the exit was extended or the den could not be read', () => {
    const end = NOW + 10 * 60_000;
    const prev = snap(NOW, den({ reinforcedUntilMs: end }));
    const extended = snap(end + 60_000, den({ reinforcedUntilMs: end + 24 * HOUR }));
    expect(diffMercenaryDenReinforced(7, prev, extended).map((f) => f.phase)).not.toContain('out');
    const unread = snap(
      end + 60_000,
      den({ reinforcedUntilMs: null, anarchyAmount: null, anarchyLevel: null })
    );
    expect(diffMercenaryDenReinforced(7, prev, unread)).toEqual([]);
  });

  it('treats a den that vanished from the list after its exit as out', () => {
    const end = NOW + 10 * 60_000;
    const fires = diffMercenaryDenReinforced(
      7,
      snap(NOW, den({ reinforcedUntilMs: end })),
      snap(end + 1)
    );
    expect(fires.map((f) => f.phase)).toEqual(['out']);
  });

  it('re-arms on a fresh reinforcement', () => {
    const first = NOW + 2 * HOUR;
    const second = NOW + 26 * HOUR;
    const prev = snap(NOW + 3 * HOUR, den({ reinforcedUntilMs: null }));
    const next = snap(NOW + 25.5 * HOUR, den({ reinforcedUntilMs: second }));
    expect(first).toBeLessThan(second);
    expect(diffMercenaryDenReinforced(7, prev, next).map((f) => f.phase)).toEqual(['soon']);
  });
});

describe('diffMercenaryDenAnarchy', () => {
  it('fires nothing without a baseline', () => {
    expect(diffMercenaryDenAnarchy(7, undefined, snap(NOW, den({ anarchyAmount: 80 })))).toEqual(
      []
    );
  });

  it('fires once when anarchy crosses the threshold, then stays quiet', () => {
    const low = snap(NOW, den({ anarchyAmount: 40 }));
    const high = snap(NOW + HOUR, den({ anarchyAmount: 55 }));
    const higher = snap(NOW + 2 * HOUR, den({ anarchyAmount: 70 }));
    expect(diffMercenaryDenAnarchy(7, low, high)).toEqual([
      {
        eventId: 'mercenaryDenAnarchy',
        characterId: 7,
        denId: 1,
        planetId: 40_000_001,
        anarchyAmount: 55,
        thresholdPct: 50,
      },
    ]);
    expect(diffMercenaryDenAnarchy(7, high, higher)).toEqual([]);
  });

  it('fires again after dropping below and crossing again', () => {
    const high = snap(NOW, den({ anarchyAmount: 60 }));
    const low = snap(NOW + HOUR, den({ anarchyAmount: 20 }));
    expect(diffMercenaryDenAnarchy(7, high, low)).toEqual([]);
    expect(
      diffMercenaryDenAnarchy(7, low, snap(NOW + 2 * HOUR, den({ anarchyAmount: 51 })))
    ).toHaveLength(1);
  });

  it('skips a den whose anarchy is unread, and does not fire from an unread previous poll', () => {
    const unread = snap(NOW, den({ anarchyAmount: null, anarchyLevel: null }));
    const high = snap(NOW + HOUR, den({ anarchyAmount: 90 }));
    expect(diffMercenaryDenAnarchy(7, high, unread)).toEqual([]);
    expect(diffMercenaryDenAnarchy(7, unread, high)).toEqual([]);
  });

  it('fires for a den first seen above the threshold', () => {
    expect(
      diffMercenaryDenAnarchy(7, snap(NOW), snap(NOW + HOUR, den({ anarchyAmount: 90 })))
    ).toHaveLength(1);
  });

  it('honours a threshold change in both directions', () => {
    const prev = snap(NOW, den({ anarchyAmount: 40, anarchyPct: 50 }));
    const lowered = snap(NOW + HOUR, den({ anarchyAmount: 40, anarchyPct: 25 }));
    expect(diffMercenaryDenAnarchy(7, prev, lowered)).toHaveLength(1);
    const prevHigh = snap(NOW, den({ anarchyAmount: 60, anarchyPct: 50 }));
    const raised = snap(NOW + HOUR, den({ anarchyAmount: 60, anarchyPct: 75 }));
    expect(diffMercenaryDenAnarchy(7, prevHigh, raised)).toEqual([]);
  });

  it('fires again when the level changes while above the threshold', () => {
    const prev = snap(NOW, den({ anarchyAmount: 60, anarchyLevel: 1 }));
    const next = snap(NOW + HOUR, den({ anarchyAmount: 55, anarchyLevel: 2 }));
    expect(diffMercenaryDenAnarchy(7, prev, next)).toHaveLength(1);
  });
});
