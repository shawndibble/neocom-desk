import { describe, expect, it } from 'vitest';
import {
  diffSkyhookRaidableNearby,
  type SkyhookAlertEntry,
  type SkyhookAlertSnapshot,
} from './skyhookAlert';

const CHARACTER = 90000001;
const HOME = 30000142;
const HOUR = 3_600_000;

function entry(overrides: Partial<SkyhookAlertEntry> = {}): SkyhookAlertEntry {
  return {
    systemId: 30000144,
    planetId: 40000001,
    startMs: 10 * HOUR,
    endMs: 14 * HOUR,
    jumps: 2,
    originSystemId: HOME,
    withinJumps: 3,
    ...overrides,
  };
}

const snapshot = (entries: SkyhookAlertEntry[], nowMs = 9 * HOUR): SkyhookAlertSnapshot => ({
  entries,
  nowMs,
});

describe('diffSkyhookRaidableNearby', () => {
  it('stays quiet on the first poll', () => {
    expect(diffSkyhookRaidableNearby(CHARACTER, undefined, snapshot([entry()]))).toEqual([]);
  });

  it('fires once when a skyhook window appears within range', () => {
    const fires = diffSkyhookRaidableNearby(CHARACTER, snapshot([]), snapshot([entry()]));
    expect(fires).toEqual([
      {
        eventId: 'skyhookRaidableNearby',
        characterId: CHARACTER,
        systemId: 30000144,
        planetId: 40000001,
        startMs: 10 * HOUR,
        endMs: 14 * HOUR,
        jumps: 2,
      },
    ]);
    expect(diffSkyhookRaidableNearby(CHARACTER, snapshot([entry()]), snapshot([entry()]))).toEqual(
      []
    );
  });

  it('fires when a known skyhook comes into range', () => {
    const prev = snapshot([entry({ jumps: 6 })]);
    expect(diffSkyhookRaidableNearby(CHARACTER, prev, snapshot([entry()]))).toHaveLength(1);
  });

  it('ignores skyhooks out of range or unreachable', () => {
    const next = snapshot([entry({ jumps: 4 }), entry({ planetId: 2, jumps: null })]);
    expect(diffSkyhookRaidableNearby(CHARACTER, snapshot([]), next)).toEqual([]);
  });

  it('fires again for the same skyhook in a later window', () => {
    const prev = snapshot([entry()]);
    const next = snapshot([entry({ startMs: 34 * HOUR, endMs: 38 * HOUR })]);
    expect(diffSkyhookRaidableNearby(CHARACTER, prev, next)).toHaveLength(1);
  });

  it('does not fire for a window already over', () => {
    const next = snapshot([entry()], 15 * HOUR);
    expect(diffSkyhookRaidableNearby(CHARACTER, snapshot([]), next)).toEqual([]);
  });

  it('re-baselines silently when the origin or threshold changed', () => {
    const prev = snapshot([entry({ jumps: 5, withinJumps: 3 })]);
    expect(
      diffSkyhookRaidableNearby(CHARACTER, prev, snapshot([entry({ withinJumps: 5, jumps: 5 })]))
    ).toEqual([]);
    expect(
      diffSkyhookRaidableNearby(CHARACTER, prev, snapshot([entry({ originSystemId: 1, jumps: 1 })]))
    ).toEqual([]);
  });
});
