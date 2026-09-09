import { describe, expect, it } from 'vitest';
import {
  applyPlanSeed,
  clearPlanSeed,
  matchesPlanSeed,
  parsePlanSeed,
  type BuildPlanSeed,
} from './planSeed';

const seedOf = (search: string) => parsePlanSeed(new URLSearchParams(search));

describe('parsePlanSeed', () => {
  it('reads ME, TE and runs from the query', () => {
    expect(seedOf('product=587&me=10&te=20&runs=5')).toEqual({ me: 10, te: 20, runs: 5 });
  });

  it('accepts an unresearched copy (ME 0 / TE 0)', () => {
    expect(seedOf('me=0&te=0&runs=1')).toEqual({ me: 0, te: 0, runs: 1 });
  });

  it('is all-or-nothing: a partial seed is no seed', () => {
    expect(seedOf('me=10&te=20')).toBeNull();
    expect(seedOf('me=10&runs=5')).toBeNull();
    expect(seedOf('te=20&runs=5')).toBeNull();
    expect(seedOf('product=587')).toBeNull();
  });

  it('rejects values a Build Plan could not hold', () => {
    // Out of the game's own ME 0..10 / TE 0..20 ranges: a hand-edited URL must
    // not write a plan the ME/TE inputs themselves would refuse.
    expect(seedOf('me=11&te=20&runs=5')).toBeNull();
    expect(seedOf('me=10&te=21&runs=5')).toBeNull();
    expect(seedOf('me=-1&te=0&runs=1')).toBeNull();
    expect(seedOf('me=0&te=-1&runs=1')).toBeNull();
    // A blueprint original (runs -1 in ESI) is never a BPC search row, and a
    // zero-run plan builds nothing.
    expect(seedOf('me=0&te=0&runs=0')).toBeNull();
    expect(seedOf('me=0&te=0&runs=-1')).toBeNull();
  });

  it('rejects anything that is not a plain integer', () => {
    expect(seedOf('me=abc&te=0&runs=1')).toBeNull();
    expect(seedOf('me=&te=0&runs=1')).toBeNull();
    expect(seedOf('me=5.5&te=0&runs=1')).toBeNull();
    expect(seedOf('me=0&te=0&runs=1e309')).toBeNull();
  });
});

describe('applyPlanSeed / clearPlanSeed', () => {
  it('round-trips a seed through a query string', () => {
    const params = new URLSearchParams({ product: '587' });
    applyPlanSeed(params, { me: 10, te: 20, runs: 5 });
    expect(params.get('product')).toBe('587');
    expect(parsePlanSeed(params)).toEqual({ me: 10, te: 20, runs: 5 });
  });

  it('writes nothing when there is no seed', () => {
    const params = new URLSearchParams({ product: '587' });
    applyPlanSeed(params, null);
    expect(params.toString()).toBe('product=587');
  });

  it('clears every seed key and leaves the rest alone', () => {
    const params = new URLSearchParams('product=587&me=10&te=20&runs=5&tab=plans');
    clearPlanSeed(params);
    expect(params.get('me')).toBeNull();
    expect(params.get('te')).toBeNull();
    expect(params.get('runs')).toBeNull();
    expect(params.get('tab')).toBe('plans');
  });
});

describe('matchesPlanSeed', () => {
  const seed: BuildPlanSeed = { me: 10, te: 20, runs: 5 };

  it('matches a plan holding exactly those three numbers', () => {
    expect(matchesPlanSeed({ me: 10, te: 20, runs: 5 }, seed)).toBe(true);
  });

  it('rejects a plan differing in any one of them', () => {
    expect(matchesPlanSeed({ me: 0, te: 20, runs: 5 }, seed)).toBe(false);
    expect(matchesPlanSeed({ me: 10, te: 0, runs: 5 }, seed)).toBe(false);
    expect(matchesPlanSeed({ me: 10, te: 20, runs: 1 }, seed)).toBe(false);
  });
});
