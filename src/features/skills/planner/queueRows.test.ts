import { describe, it, expect } from 'vitest';
import { summarizeEntryQueue, buildMergedRows, placeBandHeaders } from './queueRows';
import { entryId } from './reorder';
import { markerRowId } from './markers';
import type { PlanEntry, PlanPriority, ScheduledStep } from '@/engine/types';

const entry = (skillTypeID: number, targetLevel = 1): PlanEntry => ({ skillTypeID, targetLevel });

function step(
  skillTypeID: number,
  level: number,
  seconds: number,
  cumulativeSeconds: number
): ScheduledStep {
  return { skillTypeID, level, sp: 0, seconds, cumulativeSeconds };
}

const alwaysKnown = () => true;

describe('summarizeEntryQueue', () => {
  it('an entry with no prereqs owns its whole range, no prereq rows', () => {
    const scheduled = [step(1, 1, 100, 100)];
    const info = summarizeEntryQueue([entry(1)], [1], scheduled, alwaysKnown);
    expect(info.get(1)).toEqual({
      summary: { seconds: 100, cumulativeSeconds: 100, steps: [scheduled[0]], stepIndices: [0] },
      prereqRows: [],
    });
  });

  it('leading steps for a different skill in the range become prereq rows', () => {
    const scheduled = [step(9, 1, 50, 50), step(1, 1, 100, 150)];
    const info = summarizeEntryQueue([entry(1)], [2], scheduled, alwaysKnown);
    expect(info.get(1)).toEqual({
      summary: { seconds: 100, cumulativeSeconds: 150, steps: [scheduled[1]], stepIndices: [1] },
      prereqRows: [{ step: scheduled[0], stepIndex: 0 }],
    });
  });

  it('an entry spanning multiple levels of its own skill sums their seconds and uses the last cumulative', () => {
    const scheduled = [step(1, 1, 100, 100), step(1, 2, 200, 300), step(1, 3, 300, 600)];
    const info = summarizeEntryQueue([entry(1, 3)], [3], scheduled, alwaysKnown);
    expect(info.get(1)).toEqual({
      summary: { seconds: 600, cumulativeSeconds: 600, steps: scheduled, stepIndices: [0, 1, 2] },
      prereqRows: [],
    });
  });

  it('carries the levels it actually trains, which start above an already-trained level rather than at I', () => {
    // "Caldari Carrier V" on a character already at III: the plan queues IV
    // and V only, so the row must label itself IV–V and not I–V (#254).
    const scheduled = [step(1, 4, 400, 400), step(1, 5, 500, 900)];
    const info = summarizeEntryQueue([entry(1, 5)], [2], scheduled, alwaysKnown);
    expect(info.get(1)?.summary.steps.map((s) => s.level)).toEqual([4, 5]);
  });

  it('an already-trained entry (empty range) carries the previous cumulative forward with zero seconds', () => {
    const scheduled = [step(1, 1, 100, 100)];
    // entry 1 owns steps[0:1], entry 2 (already trained) owns steps[1:1] (empty)
    const info = summarizeEntryQueue([entry(1), entry(2)], [1, 1], scheduled, alwaysKnown);
    expect(info.get(2)).toEqual({
      summary: { seconds: 0, cumulativeSeconds: 100, steps: [], stepIndices: [] },
      prereqRows: [],
    });
  });

  it('an already-trained entry as the very first entry carries zero cumulative, not a crash', () => {
    const scheduled: ScheduledStep[] = [];
    const info = summarizeEntryQueue([entry(1)], [0], scheduled, alwaysKnown);
    expect(info.get(1)).toEqual({
      summary: { seconds: 0, cumulativeSeconds: 0, steps: [], stepIndices: [] },
      prereqRows: [],
    });
  });

  it("a later entry whose prereq re-trains an earlier entry's skill to a higher level owns those extra steps itself", () => {
    // Entry 1 targets skill A at I; entry 2 (skill B) needs A at III as a prereq.
    // boundaries: entry 1 -> 1 (owns A:1), entry 2 -> 4 (owns A:2, A:3 as prereq rows, then B:1).
    const scheduled = [
      step(1, 1, 10, 10),
      step(1, 2, 10, 20),
      step(1, 3, 10, 30),
      step(2, 1, 10, 40),
    ];
    const info = summarizeEntryQueue([entry(1), entry(2)], [1, 4], scheduled, alwaysKnown);
    expect(info.get(1)).toEqual({
      summary: { seconds: 10, cumulativeSeconds: 10, steps: [scheduled[0]], stepIndices: [0] },
      prereqRows: [],
    });
    expect(info.get(2)).toEqual({
      summary: { seconds: 10, cumulativeSeconds: 40, steps: [scheduled[3]], stepIndices: [3] },
      prereqRows: [
        { step: scheduled[1], stepIndex: 1 },
        { step: scheduled[2], stepIndex: 2 },
      ],
    });
  });

  it('an entry whose skill is unknown to the catalog contributes zero steps without consuming a boundary', () => {
    const scheduled = [step(1, 1, 100, 100)];
    const isKnown = (skillTypeID: number) => skillTypeID !== 999;
    // entryBoundaries only covers the known entry (skillTypeID 1).
    const info = summarizeEntryQueue([entry(999), entry(1)], [1], scheduled, isKnown);
    expect(info.get(999)).toEqual({
      summary: { seconds: 0, cumulativeSeconds: 0, steps: [], stepIndices: [] },
      prereqRows: [],
    });
    expect(info.get(1)).toEqual({
      summary: { seconds: 100, cumulativeSeconds: 100, steps: [scheduled[0]], stepIndices: [0] },
      prereqRows: [],
    });
  });

  it("an unknown entry after a known one carries the known entry's cumulative forward", () => {
    const scheduled = [step(1, 1, 100, 100)];
    const isKnown = (skillTypeID: number) => skillTypeID !== 999;
    const info = summarizeEntryQueue([entry(1), entry(999)], [1], scheduled, isKnown);
    expect(info.get(999)).toEqual({
      summary: { seconds: 0, cumulativeSeconds: 100, steps: [], stepIndices: [] },
      prereqRows: [],
    });
  });
});

describe('buildMergedRows', () => {
  it('one entry row per entry, in order, when there are no prereq rows', () => {
    const entries = [entry(1), entry(2)];
    const scheduled = [step(1, 1, 100, 100), step(2, 1, 50, 150)];
    const queue = summarizeEntryQueue(entries, [1, 2], scheduled, alwaysKnown);
    const rows = buildMergedRows(entries, undefined, queue);
    expect(rows).toEqual([
      {
        kind: 'entry',
        id: entryId(entries[0]),
        entry: entries[0],
        seconds: 100,
        cumulativeSeconds: 100,
        steps: [scheduled[0]],
        stepIndices: [0],
      },
      {
        kind: 'entry',
        id: entryId(entries[1]),
        entry: entries[1],
        seconds: 50,
        cumulativeSeconds: 150,
        steps: [scheduled[1]],
        stepIndices: [1],
      },
    ]);
  });

  it('prereq rows precede the entry row they were inserted for', () => {
    const entries = [entry(1)];
    const scheduled = [step(9, 1, 50, 50), step(1, 1, 100, 150)];
    const queue = summarizeEntryQueue(entries, [2], scheduled, alwaysKnown);
    const rows = buildMergedRows(entries, undefined, queue);
    expect(rows).toEqual([
      { kind: 'prereq', id: 'prereq-9-1', step: scheduled[0], stepIndex: 0 },
      {
        kind: 'entry',
        id: entryId(entries[0]),
        entry: entries[0],
        seconds: 100,
        cumulativeSeconds: 150,
        steps: [scheduled[1]],
        stepIndices: [1],
      },
    ]);
  });

  it('markers interleave before the entry (and its prereq rows) at their position', () => {
    const entries = [entry(1), entry(2)];
    const scheduled = [step(1, 1, 100, 100), step(2, 1, 50, 150)];
    const queue = summarizeEntryQueue(entries, [1, 2], scheduled, alwaysKnown);
    const rows = buildMergedRows(entries, [1], queue); // marker between entry 1 and 2
    expect(rows.map((r) => r.kind)).toEqual(['entry', 'marker', 'entry']);
    expect(rows[1]).toEqual({ kind: 'marker', id: markerRowId(0), markerIndex: 0 });
  });

  it('an entry missing from the queue map (defensive) renders with zero time rather than throwing', () => {
    const entries = [entry(1)];
    const rows = buildMergedRows(entries, undefined, new Map());
    expect(rows).toEqual([
      {
        kind: 'entry',
        id: entryId(entries[0]),
        entry: entries[0],
        seconds: 0,
        cumulativeSeconds: 0,
        steps: [],
        stepIndices: [],
      },
    ]);
  });
});

describe('placeBandHeaders', () => {
  const priorities = (pairs: [string, PlanPriority][]): Map<string, PlanPriority> => new Map(pairs);

  it('an entry with no prereq rows keeps its band at its own row id', () => {
    const entries = [entry(1)];
    const scheduled = [step(1, 1, 100, 100)];
    const queue = summarizeEntryQueue(entries, [1], scheduled, alwaysKnown);
    const rows = buildMergedRows(entries, undefined, queue);
    const bandsAt = priorities([[entryId(entries[0]), 'high']]);
    expect(placeBandHeaders(rows, bandsAt)).toEqual(priorities([[entryId(entries[0]), 'high']]));
  });

  it('an entry with prereq rows moves its band to the first prereq row, not its own row', () => {
    const entries = [entry(1)];
    const scheduled = [step(9, 1, 50, 50), step(1, 1, 100, 150)];
    const queue = summarizeEntryQueue(entries, [2], scheduled, alwaysKnown);
    const rows = buildMergedRows(entries, undefined, queue);
    const bandsAt = priorities([[entryId(entries[0]), 'high']]);
    const placement = placeBandHeaders(rows, bandsAt);
    expect(placement).toEqual(priorities([['prereq-9-1', 'high']]));
    expect(placement.has(entryId(entries[0]))).toBe(false);
  });

  it("a marker between two entries resets the run, so the second entry's band still lands on its own first prereq row", () => {
    const entries = [entry(1), entry(2)];
    const scheduled = [step(1, 1, 10, 10), step(9, 1, 50, 60), step(2, 1, 100, 160)];
    const queue = summarizeEntryQueue(entries, [1, 3], scheduled, alwaysKnown);
    const rows = buildMergedRows(entries, [1], queue); // marker between entry 1 and 2
    const bandsAt = priorities([
      [entryId(entries[0]), 'high'],
      [entryId(entries[1]), 'low'],
    ]);
    const placement = placeBandHeaders(rows, bandsAt);
    expect(placement).toEqual(
      priorities([
        [entryId(entries[0]), 'high'],
        ['prereq-9-1', 'low'],
      ])
    );
  });

  it('an entry with no band entry produces no placement', () => {
    const entries = [entry(1)];
    const scheduled = [step(9, 1, 50, 50), step(1, 1, 100, 150)];
    const queue = summarizeEntryQueue(entries, [2], scheduled, alwaysKnown);
    const rows = buildMergedRows(entries, undefined, queue);
    expect(placeBandHeaders(rows, new Map())).toEqual(new Map());
  });
});
