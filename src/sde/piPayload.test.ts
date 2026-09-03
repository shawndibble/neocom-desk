import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import en from '@/i18n/locales/en.json';
import type { PiData } from './types';

/**
 * public/data/pi.json is emitted by scripts/build-sde.mjs, so nothing the
 * compiler sees ever checks it against `PiData`. These assertions pin the
 * declared contract onto the payload actually committed — a regenerate that
 * drops a volume or a planet-type list fails here rather than in the UI.
 */
const pi = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'public', 'data', 'pi.json'), 'utf8')
) as PiData;

/**
 * The eight values ESI returns for `CharacterPlanet.planet_type` (declared as
 * `PlanetType` in src/esi/endpoints.ts, field verified against
 * https://esi.evetech.net/meta/openapi.json). A P0's `planetTypes` entries are
 * drawn from this set so a character's colony matches the table directly, with
 * no translation layer.
 */
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
    // Same keys the route renders through `pi.planetType.*`, so every value in
    // the payload has a label and the i18n bundle carries no orphan key.
    expect(Object.keys(en.pi.planetType).sort()).toEqual([...ESI_PLANET_TYPES]);
    // All eight are reachable: every planet type in New Eden yields at least
    // one P0, so a missing or misspelled one shows up as a set mismatch.
    const used = [...new Set(pi.raw.flatMap((entry) => entry.planetTypes))].sort();
    expect(used).toEqual([...ESI_PLANET_TYPES]);
  });

  it('keeps P0 entries sorted by typeID', () => {
    const ids = pi.raw.map((entry) => entry.typeID);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });
});
