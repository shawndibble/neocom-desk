import { describe, expect, it } from 'vitest';
import { concordLpCost, concordRate, iskPerConcordLp } from './concordExchange';

describe('concordRate', () => {
  it('is 0.8 and verified for the Empire factions, Ammatar and Khanid', () => {
    for (const factionId of [500001, 500002, 500003, 500004, 500007, 500008]) {
      expect(concordRate({ id: 1000, factionId })).toEqual({ rate: 0.8, basis: 'verified' });
    }
  });

  it('is 0.4 and assumed for the other converting factions', () => {
    for (const factionId of [500009, 500014, 500015, 500017, 500018, 500019]) {
      expect(concordRate({ id: 1000, factionId })).toEqual({ rate: 0.4, basis: 'assumed' });
    }
    // Sisters of EVE converts, though its faction also holds two corps that do not.
    expect(concordRate({ id: 1000130, factionId: 500016 })).toEqual({
      rate: 0.4,
      basis: 'assumed',
    });
  });

  it('has no exchange for Food Relief and The Sanctuary', () => {
    expect(concordRate({ id: 1000139, factionId: 500016 })).toBeNull();
    expect(concordRate({ id: 1000159, factionId: 500016 })).toBeNull();
  });

  it('has no exchange for CONCORD, pirates, Triglavians or the EverMark corps', () => {
    for (const factionId of [500006, 500010, 500011, 500012, 500020, 500026, 500013]) {
      expect(concordRate({ id: 1000, factionId })).toBeNull();
    }
  });

  it('has no exchange when the faction is missing or unknown', () => {
    expect(concordRate({ id: 1000 })).toBeNull();
    expect(concordRate({ id: 1000, factionId: 42 })).toBeNull();
  });
});

describe('concord conversion', () => {
  it('costs target LP / rate in CONCORD LP', () => {
    expect(concordLpCost(1000, 0.8)).toBe(1250);
  });

  it('scales ISK per LP by the rate, keeping a missing value missing', () => {
    expect(iskPerConcordLp(1000, 0.8)).toBe(800);
    expect(iskPerConcordLp(null, 0.8)).toBeNull();
  });
});
