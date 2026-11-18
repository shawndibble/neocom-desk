import { describe, expect, it } from 'vitest';
import { VETTING_CHECKS, assessVetting } from './vettingEngine.js';

describe('vettingEngine', () => {
  it('runs under the functions build', () => {
    const { flags, checks } = assessVetting({ now: 0, characters: [], parties: [], watchlist: [] });
    expect(flags).toEqual([]);
    expect(checks.map((check) => check.check)).toEqual([...VETTING_CHECKS]);
  });
});
