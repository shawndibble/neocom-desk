import { describe, expect, it } from 'vitest';
import {
  FILL_BATCH_CAP,
  fillCanFindMore,
  fillFullAtM3,
  haulingFillStop,
  type FillBatchOutcome,
} from './haulingFillStop';

/** A batch that found more, with plenty of room left: the fill goes on. */
const going: FillBatchOutcome = {
  batchInPress: 1,
  batchRows: 12,
  capped: true,
  newLines: 5,
  freeM3: 30_000,
  capacityM3: 60_000,
  binding: 'space',
};
const stop = (over: Partial<FillBatchOutcome>) => haulingFillStop({ ...going, ...over });

describe('fillFullAtM3', () => {
  it('is 1% of the hold, never under 50 m³', () => {
    expect(fillFullAtM3(60_000)).toBe(600);
    expect(fillFullAtM3(2_000)).toBe(50);
    expect(fillFullAtM3(0)).toBe(50);
  });
});

describe('haulingFillStop', () => {
  it('goes on while a batch adds profit and room is left', () => {
    expect(haulingFillStop(going)).toBeNull();
  });

  it('stops full once the free space is at or under the threshold', () => {
    expect(stop({ freeM3: 600 })).toBe('full');
    expect(stop({ freeM3: 601 })).toBeNull();
    expect(stop({ freeM3: 50, capacityM3: 1_000 })).toBe('full');
    expect(stop({ freeM3: 0, newLines: 0, batchRows: 0, capped: false })).toBe('full');
  });

  it('stops when the budget binds the plan', () => {
    expect(stop({ binding: 'budget' })).toBe('budget');
    expect(stop({ binding: 'budget', newLines: 0 })).toBe('budget');
  });

  it('stops with nothing left when a batch returned nothing and was not cut short', () => {
    expect(stop({ batchRows: 0, capped: false, newLines: 0 })).toBe('nothing-left');
  });

  it('stops with no gain when a batch’s rows add no profitable line', () => {
    expect(stop({ newLines: 0 })).toBe('no-gain');
  });

  it('goes on after an empty batch that was cut short: the next one scans further', () => {
    expect(stop({ batchRows: 0, capped: true, newLines: 0 })).toBeNull();
  });

  it('stops at the batch cap, counted per press', () => {
    expect(stop({ batchInPress: FILL_BATCH_CAP - 1 })).toBeNull();
    expect(stop({ batchInPress: FILL_BATCH_CAP })).toBe('batch-cap');
    expect(FILL_BATCH_CAP).toBe(8);
  });

  it('names full before any other reason', () => {
    expect(stop({ freeM3: 10, binding: 'budget', batchInPress: FILL_BATCH_CAP })).toBe('full');
  });
});

describe('fillCanFindMore', () => {
  const room = { freeM3: 30_000, capacityM3: 60_000, binding: 'space' as const };
  it('offers more while there is room and something may be left', () => {
    for (const reason of ['no-gain', 'batch-cap', 'stopped'] as const) {
      expect(fillCanFindMore({ ...room, reason })).toBe(true);
    }
  });
  it('not when full, nothing is left, or Max spend binds', () => {
    expect(fillCanFindMore({ ...room, reason: 'stopped', freeM3: 600 })).toBe(false);
    expect(fillCanFindMore({ ...room, reason: 'nothing-left' })).toBe(false);
    expect(fillCanFindMore({ ...room, reason: 'budget', binding: 'budget' })).toBe(false);
    // A raised Max spend moves the binding: more is back.
    expect(fillCanFindMore({ ...room, reason: 'budget' })).toBe(true);
  });
});
