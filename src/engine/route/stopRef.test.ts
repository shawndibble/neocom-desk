import { describe, expect, it } from 'vitest';
import { parseStopRefs, serializeStopRefs } from './stopRef';

describe('parseStopRefs', () => {
  it('reads plain system ids as stops with no station', () => {
    expect(parseStopRefs('30000142,30002187')).toEqual([
      { systemId: 30000142, stationId: null },
      { systemId: 30002187, stationId: null },
    ]);
  });

  it('reads a station tag after the system id', () => {
    expect(parseStopRefs('30000142:60003760,30002187')).toEqual([
      { systemId: 30000142, stationId: 60003760 },
      { systemId: 30002187, stationId: null },
    ]);
  });

  it('reads nothing from an empty or missing value', () => {
    expect(parseStopRefs(null)).toEqual([]);
    expect(parseStopRefs('')).toEqual([]);
  });

  it('reads nothing from a list with a token it cannot read', () => {
    expect(parseStopRefs('30000142,abc')).toEqual([]);
    expect(parseStopRefs('30000142:x')).toEqual([]);
    expect(parseStopRefs('30000142:60003760:1')).toEqual([]);
    expect(parseStopRefs('30000142:')).toEqual([]);
  });
});

describe('serializeStopRefs', () => {
  it('writes plain ids exactly as before for stops with no station', () => {
    expect(
      serializeStopRefs([
        { systemId: 30000142, stationId: null },
        { systemId: 30002187, stationId: null },
      ])
    ).toBe('30000142,30002187');
  });

  it('writes the station tag after its system', () => {
    expect(serializeStopRefs([{ systemId: 30000142, stationId: 60003760 }])).toBe(
      '30000142:60003760'
    );
  });

  it('writes null for no stops', () => {
    expect(serializeStopRefs([])).toBeNull();
  });
});
