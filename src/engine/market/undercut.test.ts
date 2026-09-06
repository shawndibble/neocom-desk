import { describe, it, expect } from 'vitest';
import { findUndercut, type CompetingOrder, type MyOrder } from './undercut';

const mySell: MyOrder = {
  orderId: 1,
  price: 100,
  locationId: 60003760,
  systemId: 30000142,
  isBuyOrder: false,
};

const myBuy: MyOrder = {
  ...mySell,
  isBuyOrder: true,
};

function rival(overrides: Partial<CompetingOrder>): CompetingOrder {
  return {
    orderId: 999,
    price: 90,
    locationId: 60003760,
    systemId: 30000142,
    volumeRemain: 10,
    isBuyOrder: false,
    ...overrides,
  };
}

describe('findUndercut — direction', () => {
  it('a lower price beats a sell order', () => {
    const result = findUndercut(mySell, [rival({ orderId: 2, price: 90 })]);
    expect(result.worst?.price).toBe(90);
    expect(result.worst?.gapIsk).toBe(10);
    expect(result.worst?.gapPct).toBeCloseTo(10, 12);
  });

  it('a higher price beats (outbids) a buy order', () => {
    const result = findUndercut(myBuy, [rival({ orderId: 2, price: 110, isBuyOrder: true })]);
    expect(result.worst?.price).toBe(110);
    expect(result.worst?.gapIsk).toBe(10);
    expect(result.worst?.gapPct).toBeCloseTo(10, 12);
  });

  it('does not treat a lower buy order as beating my sell order', () => {
    const result = findUndercut(mySell, [rival({ orderId: 2, price: 50, isBuyOrder: true })]);
    expect(result.worst).toBeNull();
  });

  it('does not treat a higher sell order as beating my buy order', () => {
    const result = findUndercut(myBuy, [rival({ orderId: 2, price: 150, isBuyOrder: false })]);
    expect(result.worst).toBeNull();
  });

  it('equal price does not beat a sell order (strict comparison)', () => {
    const result = findUndercut(mySell, [rival({ orderId: 2, price: 100 })]);
    expect(result.worst).toBeNull();
  });

  it('equal price does not beat a buy order (strict comparison)', () => {
    const result = findUndercut(myBuy, [rival({ orderId: 2, price: 100, isBuyOrder: true })]);
    expect(result.worst).toBeNull();
  });
});

describe('findUndercut — self exclusion', () => {
  it('excludes my own order by orderId, even when its price would otherwise beat me', () => {
    const result = findUndercut(mySell, [rival({ orderId: mySell.orderId, price: 10 })]);
    expect(result.worst).toBeNull();
  });
});

describe('findUndercut — scopes', () => {
  it('station scope matches same locationId only', () => {
    const result = findUndercut(mySell, [
      rival({ orderId: 2, price: 90, locationId: mySell.locationId }),
      rival({ orderId: 3, price: 80, locationId: 60003761 }),
    ]);
    expect(result.byScope.station?.price).toBe(90);
    expect(result.byScope.station?.ordersBeatingMe).toBe(1);
  });

  it('system scope matches same systemId, including other stations in it', () => {
    const result = findUndercut(mySell, [
      rival({ orderId: 2, price: 90, locationId: 60003761, systemId: mySell.systemId }),
    ]);
    expect(result.byScope.station).toBeNull();
    expect(result.byScope.system?.price).toBe(90);
  });

  it('region scope includes everything passed in, regardless of station/system', () => {
    const result = findUndercut(mySell, [
      rival({ orderId: 2, price: 90, locationId: 60009999, systemId: 30099999 }),
    ]);
    expect(result.byScope.station).toBeNull();
    expect(result.byScope.system).toBeNull();
    expect(result.byScope.region?.price).toBe(90);
  });

  it('worst picks the tightest scope with a rival: station over system over region', () => {
    const result = findUndercut(mySell, [
      rival({ orderId: 2, price: 95, locationId: mySell.locationId, systemId: mySell.systemId }), // station
      rival({ orderId: 3, price: 90, locationId: 60003761, systemId: mySell.systemId }), // system only
      rival({ orderId: 4, price: 80, locationId: 60009999, systemId: 30099999 }), // region only
    ]);
    expect(result.worst?.scope).toBe('station');
    expect(result.worst?.price).toBe(95);
  });

  it('falls back to system when there is no station rival', () => {
    const result = findUndercut(mySell, [
      rival({ orderId: 3, price: 90, locationId: 60003761, systemId: mySell.systemId }),
    ]);
    expect(result.worst?.scope).toBe('system');
  });

  it('falls back to region when there is no station or system rival', () => {
    const result = findUndercut(mySell, [
      rival({ orderId: 4, price: 80, locationId: 60009999, systemId: 30099999 }),
    ]);
    expect(result.worst?.scope).toBe('region');
  });

  it('worst is null when nothing beats me in any checked scope', () => {
    const result = findUndercut(mySell, [rival({ orderId: 2, price: 100 })]);
    expect(result.worst).toBeNull();
    expect(result.byScope.station).toBeNull();
    expect(result.byScope.system).toBeNull();
    expect(result.byScope.region).toBeNull();
  });

  it('enforces the nesting invariant: region rival price is never worse (for me) than system, which is never worse than station', () => {
    const result = findUndercut(mySell, [
      rival({ orderId: 2, price: 95, locationId: mySell.locationId, systemId: mySell.systemId }),
      rival({ orderId: 3, price: 92, locationId: 60003761, systemId: mySell.systemId }),
      rival({ orderId: 4, price: 85, locationId: 60009999, systemId: 30099999 }),
    ]);
    const station = result.byScope.station?.price ?? Infinity;
    const system = result.byScope.system?.price ?? Infinity;
    const region = result.byScope.region?.price ?? Infinity;
    // sell side: lower is better for the rival, so region <= system <= station
    expect(region).toBeLessThanOrEqual(system);
    expect(system).toBeLessThanOrEqual(station);
  });
});

describe('findUndercut — scopesChecked', () => {
  it('computes only the requested scopes, and byScope omits the rest (absent, not null)', () => {
    const result = findUndercut(mySell, [rival({ orderId: 2, price: 90 })], ['station']);
    expect('station' in result.byScope).toBe(true);
    expect('system' in result.byScope).toBe(false);
    expect('region' in result.byScope).toBe(false);
    expect(result.worst?.scope).toBe('station');
  });

  it('worst only considers checked scopes, even if an unchecked scope would have had a tighter rival', () => {
    const result = findUndercut(
      mySell,
      [rival({ orderId: 2, price: 90, locationId: mySell.locationId })],
      ['system', 'region']
    );
    // the station rival exists but station was not checked
    expect(result.byScope.system?.price).toBe(90);
    expect(result.worst?.scope).toBe('system');
  });
});

describe('findUndercut — aggregates', () => {
  it('counts every order beating me in scope, and sums their remaining volume', () => {
    const result = findUndercut(mySell, [
      rival({ orderId: 2, price: 95, volumeRemain: 5 }),
      rival({ orderId: 3, price: 90, volumeRemain: 20 }),
      rival({ orderId: 4, price: 100 }), // does not beat (equal)
    ]);
    expect(result.byScope.station?.ordersBeatingMe).toBe(2);
    expect(result.byScope.station?.unitsBeatingMe).toBe(25);
    // best (lowest) price wins as the reported rival
    expect(result.byScope.station?.price).toBe(90);
    expect(result.byScope.station?.volumeRemain).toBe(20);
  });
});

describe('findUndercut — deterministic tie-breaking', () => {
  it('prefers the larger volumeRemain when two rivals share the best price', () => {
    const result = findUndercut(mySell, [
      rival({ orderId: 2, price: 90, volumeRemain: 5, locationId: 111 }),
      rival({ orderId: 3, price: 90, volumeRemain: 50, locationId: 222 }),
    ]);
    expect(result.worst?.volumeRemain).toBe(50);
    expect(result.worst?.locationId).toBe(222);
  });

  it('prefers the lower orderId when price and volumeRemain both tie', () => {
    // orderId is not on UndercutRival, so use distinct locationId per
    // candidate to prove which competing order won the tie-break.
    const result = findUndercut(mySell, [
      rival({ orderId: 30, price: 90, volumeRemain: 10, locationId: 111 }),
      rival({ orderId: 5, price: 90, volumeRemain: 10, locationId: 222 }),
    ]);
    expect(result.worst?.locationId).toBe(222);
  });
});

describe('findUndercut — invalid input', () => {
  it('returns worst: null for a non-positive price, without throwing', () => {
    const result = findUndercut({ ...mySell, price: 0 }, [rival({ orderId: 2, price: -5 })]);
    expect(result.worst).toBeNull();
  });

  it('returns worst: null for a negative price', () => {
    const result = findUndercut({ ...mySell, price: -10 }, [rival({ orderId: 2, price: -20 })]);
    expect(result.worst).toBeNull();
  });
});
