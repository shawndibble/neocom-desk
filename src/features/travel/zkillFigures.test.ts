import { describe, expect, it } from 'vitest';
import type { PilotStats } from '@/lib/zkillboard';
import { killerRatio } from './zkillFigures';

const base = { kills: 610, losses: 304 } as PilotStats;

describe('killerRatio', () => {
  it('is kills as a 0-100 share of kills and losses', () => {
    expect(killerRatio(base)).toBe(67);
  });

  it('is 100 for a pilot with kills and no losses, 0 for the reverse', () => {
    expect(killerRatio({ ...base, kills: 5, losses: 0 })).toBe(100);
    expect(killerRatio({ ...base, kills: 0, losses: 5 })).toBe(0);
  });

  it('never reads 100 or 0 while the record has both a kill and a loss', () => {
    expect(killerRatio({ ...base, kills: 300, losses: 1 })).toBe(99);
    expect(killerRatio({ ...base, kills: 1, losses: 300 })).toBe(1);
  });

  it('is null with neither a kill nor a loss', () => {
    expect(killerRatio({ ...base, kills: 0, losses: 0 })).toBeNull();
  });
});
