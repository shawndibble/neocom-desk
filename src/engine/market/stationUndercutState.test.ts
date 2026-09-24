import { describe, it, expect } from 'vitest';
import { classifyStationUndercut } from './stationUndercutState';

describe('classifyStationUndercut', () => {
  it('reads a strictly cheaper rival sell price as beaten (undercut)', () => {
    expect(classifyStationUndercut(100, false, { sellMin: 99, buyMax: null })).toEqual({
      state: 'beaten',
      rivalPrice: 99,
    });
  });

  it('reads an equal rival sell price as clear — my own order sits inside the aggregate', () => {
    expect(classifyStationUndercut(100, false, { sellMin: 100, buyMax: null })).toEqual({
      state: 'clear',
      rivalPrice: 100,
    });
  });

  it('reads a strictly higher rival sell price as clear', () => {
    expect(classifyStationUndercut(100, false, { sellMin: 101, buyMax: null })).toEqual({
      state: 'clear',
      rivalPrice: 101,
    });
  });

  it('reads a strictly higher rival buy price as beaten (outbid)', () => {
    expect(classifyStationUndercut(50, true, { sellMin: null, buyMax: 51 })).toEqual({
      state: 'beaten',
      rivalPrice: 51,
    });
  });

  it('reads an equal rival buy price as clear', () => {
    expect(classifyStationUndercut(50, true, { sellMin: null, buyMax: 50 })).toEqual({
      state: 'clear',
      rivalPrice: 50,
    });
  });

  it('reads a strictly lower rival buy price as clear', () => {
    expect(classifyStationUndercut(50, true, { sellMin: null, buyMax: 49 })).toEqual({
      state: 'clear',
      rivalPrice: 49,
    });
  });

  it('reads a null aggregate (station never fetched) as unknown', () => {
    expect(classifyStationUndercut(100, false, null)).toEqual({
      state: 'unknown',
      rivalPrice: null,
    });
  });

  it('reads a null price on my own order side as unknown, not clear — my own order proves that side is non-empty', () => {
    expect(classifyStationUndercut(100, false, { sellMin: null, buyMax: 200 })).toEqual({
      state: 'unknown',
      rivalPrice: null,
    });
    expect(classifyStationUndercut(50, true, { sellMin: 10, buyMax: null })).toEqual({
      state: 'unknown',
      rivalPrice: null,
    });
  });
});
