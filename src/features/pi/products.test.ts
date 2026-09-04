import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { piTier } from '@/engine/pi/chain';
import { plannableTypeIds, productOptions } from './products';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const BROADCAST_NODE = 2867; // P4
const TRANSMITTER = 9840; // P2
const AQUEOUS_LIQUIDS = 2268; // P0 raw resource — extracted, never made
const TRITANIUM = 34; // not planetary at all

describe('productOptions', () => {
  it('offers every planetary commodity a factory can make, and nothing else', () => {
    const options = productOptions(pi);
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      expect(piTier(option.typeId, pi)).toBe(option.tier);
      expect(option.tier).toBeGreaterThanOrEqual(1);
      expect(option.tier).toBeLessThanOrEqual(4);
    }
    expect(options.map((option) => option.typeId)).not.toContain(AQUEOUS_LIQUIDS);
  });

  it('sorts by tier, then name', () => {
    const options = productOptions(pi);
    for (let i = 1; i < options.length; i++) {
      const previous = options[i - 1];
      const current = options[i];
      expect(previous.tier).toBeLessThanOrEqual(current.tier);
      if (previous.tier === current.tier) {
        expect(previous.name.localeCompare(current.name)).toBeLessThanOrEqual(0);
      }
    }
  });
});

describe('plannableTypeIds', () => {
  it('holds exactly what the planner can be pointed at', () => {
    const ids = plannableTypeIds(pi);
    expect([...ids].sort((a, b) => a - b)).toEqual(
      productOptions(pi)
        .map((option) => option.typeId)
        .sort((a, b) => a - b)
    );
  });

  it('accepts made commodities and rejects raw resources and non-planetary items', () => {
    const ids = plannableTypeIds(pi);
    expect(ids.has(BROADCAST_NODE)).toBe(true);
    expect(ids.has(TRANSMITTER)).toBe(true);
    expect(ids.has(AQUEOUS_LIQUIDS)).toBe(false);
    expect(ids.has(TRITANIUM)).toBe(false);
  });
});
