import { describe, expect, it } from 'vitest';
import {
  colonyStripRows,
  colonyFillTimeDisplay,
  fillsBeforeHaul,
  type ColonyStripColony,
} from './colonyStripModel';
import type { Worklist, WorklistRow } from './worklistModel';

function colony(over: Partial<ColonyStripColony> & { planetId: number }): ColonyStripColony {
  return {
    name: `P${over.planetId}`,
    planetType: 'barren',
    load: 0.5,
    hoursToFull: 100,
    ...over,
  };
}

function row(over: Partial<WorklistRow> & { planetId: number; verb: WorklistRow['verb'] }) {
  return {
    key: `${over.planetId}:${over.verb}`,
    planetName: null,
    planetType: 'barren' as const,
    label: 'x',
    iskPerHour: 1,
    ...over,
  } as WorklistRow;
}

const EMPTY: Worklist = { tuning: [], rebuilds: [] };

describe('colonyStripRows', () => {
  it('counts a haul, a removal and a stopped extractor as faults, and an addition as a step', () => {
    const [only] = colonyStripRows({
      colonies: [colony({ planetId: 1 })],
      worklist: {
        tuning: [
          row({ planetId: 1, verb: 'haul' }),
          row({ planetId: 1, verb: 'remove' }),
          row({ planetId: 1, verb: 'stopped' }),
          row({ planetId: 1, verb: 'add' }),
        ],
        rebuilds: [],
      },
      haulHours: 24,
    });
    expect(only.faults).toBe(3);
    expect(only.steps).toBe(1);
  });

  it('counts a rebuild as a step against its planet, never as a fault', () => {
    const [only] = colonyStripRows({
      colonies: [colony({ planetId: 1 })],
      worklist: { tuning: [], rebuilds: [row({ planetId: 1, verb: 'rebuild' })] },
      haulHours: 24,
    });
    expect(only.faults).toBe(0);
    expect(only.steps).toBe(1);
  });

  it('ranks faults first, then steps, then clear colonies, then unreadable ones', () => {
    const rows = colonyStripRows({
      colonies: [
        colony({ planetId: 1 }),
        colony({ planetId: 2, load: null, hoursToFull: null }),
        colony({ planetId: 3 }),
        colony({ planetId: 4 }),
      ],
      worklist: {
        tuning: [row({ planetId: 4, verb: 'remove' }), row({ planetId: 3, verb: 'add' })],
        rebuilds: [],
      },
      haulHours: 24,
    });
    expect(rows.map((entry) => entry.planetId)).toEqual([4, 3, 1, 2]);
  });

  it('keeps an unreadable colony as a row rather than dropping it', () => {
    const rows = colonyStripRows({
      colonies: [colony({ planetId: 9, load: null, hoursToFull: null })],
      worklist: EMPTY,
      haulHours: 24,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ load: null, hoursToFull: null, overflowing: false });
  });

  it('flags a colony that fills before the pilot comes back', () => {
    const rows = colonyStripRows({
      colonies: [
        colony({ planetId: 1, hoursToFull: 19 }),
        colony({ planetId: 2, hoursToFull: 200 }),
      ],
      worklist: EMPTY,
      haulHours: 168,
    });
    expect(rows.find((entry) => entry.planetId === 1)?.overflowing).toBe(true);
    expect(rows.find((entry) => entry.planetId === 2)?.overflowing).toBe(false);
  });
});

describe('fillsBeforeHaul', () => {
  it('flags a colony shorter than the haul window', () => {
    expect(fillsBeforeHaul(19, 24)).toBe(true);
  });

  it('does not flag a colony that outlasts the haul window', () => {
    expect(fillsBeforeHaul(200, 24)).toBe(false);
  });

  it('does not flag an equal window — strictly shorter, not shorter-or-equal', () => {
    expect(fillsBeforeHaul(24, 24)).toBe(false);
  });

  it('never flags an unreadable colony', () => {
    expect(fillsBeforeHaul(null, 24)).toBe(false);
  });

  it('does not flag a rare hauler whose long cadence still outruns the colony', () => {
    // A 200 h colony is not shorter than a 168 h (weekly) haul window.
    expect(fillsBeforeHaul(200, 168)).toBe(false);
  });
});

describe('colonyFillTimeDisplay', () => {
  it('reads unknown for an unreadable program, never a blank or a zero', () => {
    expect(colonyFillTimeDisplay(null, 24)).toEqual({ kind: 'unknown' });
  });

  it('surfaces the figure when the colony fills before the haul window', () => {
    expect(colonyFillTimeDisplay(19, 24)).toEqual({ kind: 'soon', hoursToFull: 19 });
  });

  it('shows nothing for a colony with room to spare', () => {
    expect(colonyFillTimeDisplay(200, 24)).toEqual({ kind: 'none' });
  });

  it('does not flag a rare hauler on a long cadence for an ordinary fill time', () => {
    expect(colonyFillTimeDisplay(200, 168)).toEqual({ kind: 'none' });
  });
});
