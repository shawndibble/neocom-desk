import { describe, it, expect } from 'vitest';
import { summarizeStationBook, type StationBookOrder } from './stationBook';

const order = (o: Partial<StationBookOrder>): StationBookOrder => ({
  is_buy_order: false,
  location_id: 60003760,
  price: 10,
  volume_remain: 5,
  ...o,
});

describe('summarizeStationBook', () => {
  it('takes the lowest sell, highest buy, summed volumes and order counts', () => {
    const book = summarizeStationBook(
      [
        order({ price: 12, volume_remain: 3 }),
        order({ price: 10, volume_remain: 7 }),
        order({ is_buy_order: true, price: 8, volume_remain: 4 }),
        order({ is_buy_order: true, price: 9, volume_remain: 6 }),
        order({ is_buy_order: true, price: 7, volume_remain: 1 }),
      ],
      60003760
    );
    expect(book).toEqual({
      sellMin: 10,
      buyMax: 9,
      sellVolume: 10,
      buyVolume: 11,
      sellOrders: 2,
      buyOrders: 3,
    });
  });

  it('counts only orders placed at the station when one is given', () => {
    const book = summarizeStationBook(
      [order({ price: 5, location_id: 1 }), order({ price: 11 })],
      60003760
    );
    expect(book.sellMin).toBe(11);
    expect(book.sellOrders).toBe(1);
  });

  it('keeps the whole region when the location is null', () => {
    const book = summarizeStationBook([order({ price: 5, location_id: 1 }), order({})], null);
    expect(book.sellMin).toBe(5);
    expect(book.sellOrders).toBe(2);
  });

  it('reports a side with no orders as null, never 0', () => {
    const book = summarizeStationBook([], 60003760);
    expect(book).toEqual({
      sellMin: null,
      buyMax: null,
      sellVolume: 0,
      buyVolume: 0,
      sellOrders: 0,
      buyOrders: 0,
    });
  });

  it('ignores a non-positive or non-finite price rather than pricing at free', () => {
    const book = summarizeStationBook([order({ price: 0 }), order({ price: Number.NaN })], null);
    expect(book.sellMin).toBeNull();
  });
});
