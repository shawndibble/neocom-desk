import { describe, it, expect } from 'vitest';
import { splitOrderBook, resolveOrderLocation, orderExpiry } from './orderBook';

interface Order {
  is_buy_order: boolean;
}

describe('splitOrderBook', () => {
  it('separates sell and buy orders, preserving relative order within each side', () => {
    const orders: Order[] = [
      { is_buy_order: false },
      { is_buy_order: true },
      { is_buy_order: false },
    ];
    const { sell, buy } = splitOrderBook(orders);
    expect(sell).toEqual([{ is_buy_order: false }, { is_buy_order: false }]);
    expect(buy).toEqual([{ is_buy_order: true }]);
  });

  it('returns empty arrays for an empty order book', () => {
    expect(splitOrderBook([])).toEqual({ sell: [], buy: [] });
  });
});

describe('resolveOrderLocation', () => {
  const npcStations = new Map([[60003760, { name: 'Jita IV - Moon 4', systemId: 30000142 }]]);
  const solarSystems = new Map([
    [30000142, { name: 'Jita', security: 0.9459 }],
    [30000144, { name: 'Perimeter', security: 0.9146 }],
  ]);

  it('resolves an NPC station order to its station name and system', () => {
    const result = resolveOrderLocation(
      { location_id: 60003760, system_id: 30000142 },
      npcStations,
      solarSystems
    );
    expect(result).toEqual({
      stationName: 'Jita IV - Moon 4',
      systemName: 'Jita',
      security: 0.9459,
    });
  });

  it('resolves an unrecognized location_id (player structure) with null station name, never dropping the row', () => {
    const result = resolveOrderLocation(
      { location_id: 1035466617946, system_id: 30000144 },
      npcStations,
      solarSystems
    );
    expect(result).toEqual({ stationName: null, systemName: 'Perimeter', security: 0.9146 });
  });

  it('falls back to empty system info when the system is missing from the snapshot', () => {
    const result = resolveOrderLocation(
      { location_id: 999999999999, system_id: 30099999 },
      npcStations,
      solarSystems
    );
    expect(result).toEqual({ stationName: null, systemName: '', security: 0 });
  });
});

describe('orderExpiry', () => {
  it('adds duration days to the issued date', () => {
    const expiry = orderExpiry({ issued: '2026-08-01T00:00:00Z', duration: 90 });
    expect(expiry.toISOString()).toBe('2026-10-30T00:00:00.000Z');
  });

  it('handles a zero-duration order (expires the moment it was issued)', () => {
    const expiry = orderExpiry({ issued: '2026-08-01T00:00:00Z', duration: 0 });
    expect(expiry.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });
});
