import { describe, expect, it } from 'vitest';
import {
  diffIncursionNearby,
  type IncursionAlertEntry,
  type IncursionAlertSnapshot,
} from './incursionAlert';

const CHARACTER = 90000001;
const HOME = 30000142;

function entry(overrides: Partial<IncursionAlertEntry> = {}): IncursionAlertEntry {
  return {
    constellationId: 20000020,
    stagingSystemId: 30000144,
    state: 'established',
    jumps: 2,
    originSystemId: HOME,
    withinJumps: 3,
    ...overrides,
  };
}

function snapshot(entries: IncursionAlertEntry[], nowMs = 1_000): IncursionAlertSnapshot {
  return { entries, nowMs };
}

describe('diffIncursionNearby', () => {
  it('stays quiet on the first poll, with nothing to compare against', () => {
    expect(diffIncursionNearby(CHARACTER, undefined, snapshot([entry()]))).toEqual([]);
  });

  it('fires once when an Incursion comes into range', () => {
    const prev = snapshot([entry({ jumps: 5 })]);
    const next = snapshot([entry({ jumps: 3 })]);
    expect(diffIncursionNearby(CHARACTER, prev, next)).toEqual([
      {
        eventId: 'incursionNearby',
        characterId: CHARACTER,
        constellationId: 20000020,
        stagingSystemId: 30000144,
        state: 'established',
        jumps: 3,
      },
    ]);
  });

  it('fires when a new Incursion appears already within range', () => {
    const prev = snapshot([entry({ constellationId: 1, jumps: 9 })]);
    const next = snapshot([entry({ constellationId: 1, jumps: 9 }), entry({ jumps: 1 })]);
    expect(diffIncursionNearby(CHARACTER, prev, next).map((fire) => fire.constellationId)).toEqual([
      20000020,
    ]);
  });

  it('stays quiet while an Incursion stays in range, even as its state moves on', () => {
    const prev = snapshot([entry({ state: 'mobilizing', jumps: 2 })]);
    const next = snapshot([entry({ state: 'established', jumps: 1 })]);
    expect(diffIncursionNearby(CHARACTER, prev, next)).toEqual([]);
  });

  it('stays quiet when an Incursion moves out of range or leaves the feed', () => {
    const prev = snapshot([entry({ jumps: 2 }), entry({ constellationId: 2, jumps: 1 })]);
    const next = snapshot([entry({ jumps: 7 })]);
    expect(diffIncursionNearby(CHARACTER, prev, next)).toEqual([]);
  });

  it('never fires for a withdrawing Incursion', () => {
    const prev = snapshot([entry({ jumps: 6 })]);
    const next = snapshot([entry({ state: 'withdrawing', jumps: 2 })]);
    expect(diffIncursionNearby(CHARACTER, prev, next)).toEqual([]);
  });

  it('counts an unreachable Incursion as out of range, and an unknown distance before as no edge', () => {
    expect(
      diffIncursionNearby(
        CHARACTER,
        snapshot([entry({ jumps: 2 })]),
        snapshot([entry({ jumps: null })])
      )
    ).toEqual([]);
    expect(
      diffIncursionNearby(
        CHARACTER,
        snapshot([entry({ jumps: null })]),
        snapshot([entry({ jumps: 2 })])
      )
    ).toHaveLength(1);
  });

  it('includes the edge itself: exactly N jumps is in range', () => {
    const prev = snapshot([entry({ jumps: 4 })]);
    expect(diffIncursionNearby(CHARACTER, prev, snapshot([entry({ jumps: 3 })]))).toHaveLength(1);
  });

  it('never bursts when N changes: Incursions already near stay quiet', () => {
    const prev = snapshot([
      entry({ jumps: 6, withinJumps: 3 }),
      entry({ constellationId: 2, jumps: 8, withinJumps: 3 }),
    ]);
    const next = snapshot([
      entry({ jumps: 6, withinJumps: 10 }),
      entry({ constellationId: 2, jumps: 8, withinJumps: 10 }),
    ]);
    expect(diffIncursionNearby(CHARACTER, prev, next)).toEqual([]);
  });

  it('never bursts when the Current System changes', () => {
    const prev = snapshot([entry({ jumps: 12, originSystemId: HOME })]);
    const next = snapshot([entry({ jumps: 1, originSystemId: 30002187 })]);
    expect(diffIncursionNearby(CHARACTER, prev, next)).toEqual([]);
  });

  it('fires for a spawn in range when the previous feed was empty', () => {
    const prev = snapshot([]);
    const next = snapshot([entry({ jumps: 1 })]);
    // An empty feed carries no frame to compare; a new spawn in range is news.
    expect(diffIncursionNearby(CHARACTER, prev, next)).toHaveLength(1);
  });
});
