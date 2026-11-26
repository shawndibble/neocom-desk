import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import en from '@/i18n/locales/en.json';
import type { PiData } from './types';

const pi = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'public', 'data', 'pi.json'), 'utf8')
) as PiData;

const ESI_PLANET_TYPES = [
  'barren',
  'gas',
  'ice',
  'lava',
  'oceanic',
  'plasma',
  'storm',
  'temperate',
] as const;

describe('public/data/pi.json', () => {
  it('carries every schematic with a positive volume', () => {
    const entries = Object.entries(pi.schematics);
    expect(entries.length).toBeGreaterThan(0);
    const bad = entries.filter(([, s]) => !(typeof s.volume === 'number' && s.volume > 0));
    expect(bad.map(([typeID]) => typeID)).toEqual([]);
  });

  it('describes every P0 resource with typeID, name, volume and planet types', () => {
    expect(pi.raw.length).toBeGreaterThan(0);
    for (const entry of pi.raw) {
      expect(Number.isInteger(entry.typeID)).toBe(true);
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.volume).toBeGreaterThan(0);
      expect(entry.planetTypes.length).toBeGreaterThan(0);
    }
  });

  it('names only ESI planet types, and only ones the UI can label', () => {
    expect(Object.keys(en.pi.planetType).sort()).toEqual([...ESI_PLANET_TYPES]);
    const used = [...new Set(pi.raw.flatMap((entry) => entry.planetTypes))].sort();
    expect(used).toEqual([...ESI_PLANET_TYPES]);
  });

  it('keeps P0 entries sorted by typeID', () => {
    const ids = pi.raw.map((entry) => entry.typeID);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });
});
