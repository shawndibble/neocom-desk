import { describe, expect, it } from 'vitest';
import {
  aggregateRefineries,
  feederGrantReadsStructures,
  parseFeederCall,
  parseSaveFeederGrantInput,
} from './corpTaxBookFeederGrant.js';

describe('save feeder grant parser', () => {
  const base = { code: 'c', accessToken: 'a', refreshToken: 'r' };

  it('takes the code and both tokens, with the rate optional', () => {
    expect(parseSaveFeederGrantInput(base)).toEqual(base);
    expect(parseSaveFeederGrantInput({ ...base, requestedRatePct: 6 }).requestedRatePct).toBe(6);
    expect(parseSaveFeederGrantInput({ ...base, requestedRatePct: null })).toEqual(base);
  });

  it.each([-1, 101, Number.NaN, '5'])('rejects a requested rate of %s', (rate) => {
    expect(() => parseSaveFeederGrantInput({ ...base, requestedRatePct: rate })).toThrow();
  });

  it.each(['code', 'accessToken', 'refreshToken'])('needs %s', (key) => {
    expect(() => parseSaveFeederGrantInput({ ...base, [key]: undefined })).toThrow();
  });
});

describe('feeder call parser', () => {
  it('needs a corporation id and an access token', () => {
    expect(parseFeederCall({ corporationId: 5, accessToken: 't' })).toEqual({
      corporationId: 5,
      accessToken: 't',
    });
    expect(() => parseFeederCall({ corporationId: 5 })).toThrow();
    expect(() => parseFeederCall({ corporationId: '5', accessToken: 't' })).toThrow();
  });
});

describe('aggregateRefineries', () => {
  const rows = [
    { structureId: 2, date: '2026-10-10', quantity: 5 },
    { structureId: 1, date: '2026-10-11', quantity: 10 },
    { structureId: 1, date: '2026-10-12', quantity: 7 },
    { structureId: 1, date: '2026-10-01', quantity: 999 },
  ];

  it('sums per refinery over covered days only, biggest first', () => {
    expect(aggregateRefineries(rows, [{ from: '2026-10-10' }])).toEqual([
      { structureId: 1, label: null, volume: 17 },
      { structureId: 2, label: null, volume: 5 },
    ]);
  });

  it('honours a closed period', () => {
    expect(aggregateRefineries(rows, [{ from: '2026-10-10', to: '2026-10-11' }])).toEqual([
      { structureId: 1, label: null, volume: 10 },
      { structureId: 2, label: null, volume: 5 },
    ]);
  });

  it('is empty with no coverage', () => {
    expect(aggregateRefineries(rows, [])).toEqual([]);
  });
});

describe('feeder grant scopes (#4654)', () => {
  const MINING = 'esi-industry.read_corporation_mining.v1';
  const STRUCTURES = 'esi-universe.read_structures.v1';
  const reason = (scopes: string[]) => {
    try {
      feederGrantReadsStructures(scopes);
      return 'ok';
    } catch (e) {
      return (e as { details?: { reason?: string } }).details?.reason;
    }
  };

  it('takes the mining and structure scopes, and says it reads structure names', () => {
    expect(feederGrantReadsStructures([MINING, STRUCTURES])).toBe(true);
  });

  it('still takes a grant from before, with the mining scope only', () => {
    expect(feederGrantReadsStructures([MINING])).toBe(false);
  });

  it('refuses a grant without the mining scope', () => {
    expect(reason([STRUCTURES])).toBe('missing-scope');
  });

  it('refuses any other scope', () => {
    expect(reason([MINING, 'esi-characters.read_corporation_roles.v1'])).toBe('wrong-scopes');
    expect(reason([MINING, STRUCTURES, 'esi-wallet.read_corporation_wallets.v1'])).toBe(
      'wrong-scopes'
    );
  });
});
