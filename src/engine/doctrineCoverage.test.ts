import { describe, it, expect } from 'vitest';
import { doctrineCoverage, doctrineParts } from '@/engine/doctrineCoverage';
import type { DoctrineFitSnapshot } from '@/engine/srpDoctrine';
import type { HubOrder } from '@/engine/market/haulingMarket';

const STATION = 60003760;
const sell = (price: number, units: number, location_id = STATION): HubOrder => ({
  price,
  volume_remain: units,
  is_buy_order: false,
  location_id,
});

const fit: DoctrineFitSnapshot = {
  hullTypeId: 1,
  name: 'Fit',
  modules: [10, 10, 11],
  rigs: [20],
};

describe('doctrineParts', () => {
  it('counts the hull once and each module and rig per ship', () => {
    expect([...doctrineParts(fit)]).toEqual([
      [1, 1],
      [10, 2],
      [11, 1],
      [20, 1],
    ]);
  });
});

describe('doctrineCoverage', () => {
  const books = (b: Record<number, HubOrder[]>) =>
    new Map(Object.entries(b).map(([id, orders]) => [Number(id), orders]));

  it('is the minimum over parts of floor(units / per ship)', () => {
    const result = doctrineCoverage(
      fit,
      books({
        1: [sell(100, 9)],
        10: [sell(10, 7)],
        11: [sell(5, 50)],
        20: [sell(1, 4)],
      }),
      STATION
    );
    expect(result?.ships).toBe(3);
    expect(result?.shortOn).toBe(10);
  });

  it('gives zero and names a part with no sell orders at the station', () => {
    const result = doctrineCoverage(
      fit,
      books({
        1: [sell(100, 9)],
        10: [sell(10, 70, 1234)],
        11: [sell(5, 50)],
        20: [sell(1, 4)],
      }),
      STATION
    );
    expect(result?.ships).toBe(0);
    expect(result?.shortOn).toBe(10);
    expect(result?.unlisted).toEqual([10]);
  });

  it('prices nothing for the next ship once the book is spent', () => {
    const result = doctrineCoverage(
      { hullTypeId: 1, name: 'x', modules: [], rigs: [] },
      books({ 1: [sell(100, 1), sell(150, 5)] }),
      STATION
    );
    expect(result?.ships).toBe(6);
    expect(result?.nextShipListedCost).toBe(0);
    expect(result?.shortOn).toBe(1);
  });

  it('costs the listed parts of the next ship from the levels after the complete ships', () => {
    const result = doctrineCoverage(
      fit,
      books({
        1: [sell(100, 5)],
        10: [sell(10, 4), sell(20, 100)],
        11: [sell(5, 1), sell(8, 100)],
        20: [sell(1, 1)],
      }),
      STATION
    );
    expect(result?.ships).toBe(1);
    expect(result?.nextShipListedCost).toBe(100 + 10 + 10 + 8);
    expect(result?.shortOn).toBe(20);
    expect(result?.unlisted).toEqual([]);
  });

  it('ignores orders far above the lowest sell', () => {
    const result = doctrineCoverage(
      { hullTypeId: 1, name: 'x', modules: [], rigs: [] },
      books({ 1: [sell(100, 2), sell(100_000, 50)] }),
      STATION
    );
    expect(result?.ships).toBe(2);
  });

  it('is null when a part has no book to read, never zero', () => {
    expect(doctrineCoverage(fit, books({ 1: [sell(100, 9)] }), STATION)).toBeNull();
    expect(doctrineCoverage(fit, new Map(), STATION)).toBeNull();
  });
});
