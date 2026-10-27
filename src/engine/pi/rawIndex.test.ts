import { describe, expect, it } from 'vitest';
import type { PiData } from '@/sde/types';
import { rawById } from './rawIndex';

const pi = {
  raw: [
    { typeID: 1, name: 'A' },
    { typeID: 2, name: 'B' },
  ],
} as unknown as PiData;

describe('rawById', () => {
  it('finds a P0 by type id and misses unknown ids', () => {
    expect(rawById(pi).get(2)?.name).toBe('B');
    expect(rawById(pi).get(9)).toBeUndefined();
  });

  it('builds the index once per PiData', () => {
    expect(rawById(pi)).toBe(rawById(pi));
  });
});
