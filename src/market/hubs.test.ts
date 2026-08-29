import { describe, it, expect } from 'vitest';
import { TRADE_HUBS, DEFAULT_TRADE_HUB, getTradeHub } from './hubs';

describe('TRADE_HUBS', () => {
  it('lists exactly the five v1 trade hubs with verified station/system/region IDs', () => {
    expect(TRADE_HUBS.map((hub) => hub.id)).toEqual(['jita', 'amarr', 'dodixie', 'rens', 'hek']);

    expect(getTradeHub('jita')).toMatchObject({
      stationId: 60003760,
      systemId: 30000142,
      regionId: 10000002,
    });
    expect(getTradeHub('amarr')).toMatchObject({
      stationId: 60008494,
      systemId: 30002187,
      regionId: 10000043,
    });
    expect(getTradeHub('dodixie')).toMatchObject({
      stationId: 60011866,
      systemId: 30002659,
      regionId: 10000032,
    });
    expect(getTradeHub('rens')).toMatchObject({
      stationId: 60004588,
      systemId: 30002510,
      regionId: 10000030,
    });
    expect(getTradeHub('hek')).toMatchObject({
      stationId: 60005686,
      systemId: 30002053,
      regionId: 10000042,
    });
  });

  it('has no duplicate station, system, or region IDs', () => {
    expect(new Set(TRADE_HUBS.map((hub) => hub.stationId)).size).toBe(TRADE_HUBS.length);
    expect(new Set(TRADE_HUBS.map((hub) => hub.systemId)).size).toBe(TRADE_HUBS.length);
    expect(new Set(TRADE_HUBS.map((hub) => hub.regionId)).size).toBe(TRADE_HUBS.length);
  });

  it('carries a short system name distinct from the full station name (UX-REVIEW #6)', () => {
    expect(TRADE_HUBS.map((hub) => hub.systemName)).toEqual([
      'Jita',
      'Amarr',
      'Dodixie',
      'Rens',
      'Hek',
    ]);
  });

  it('defaults to Jita 4-4', () => {
    expect(DEFAULT_TRADE_HUB.id).toBe('jita');
    expect(DEFAULT_TRADE_HUB).toBe(TRADE_HUBS[0]);
  });

  it('getTradeHub returns undefined for an unknown id', () => {
    expect(getTradeHub('unknown' as never)).toBeUndefined();
  });
});
