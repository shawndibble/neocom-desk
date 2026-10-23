import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FITTING_RACKS, MUTAPLASMID_BASES } from './data/srpDoctrineData.js';

const pub = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../public/data/${name}`, import.meta.url), 'utf8'));

// functions/ cannot import public/, so it keeps a compact copy (scripts/build-srp-doctrine-data.mjs).
describe('srpDoctrineData copy', () => {
  it('matches public/data/fittingSlots.json (drones left out)', () => {
    const slots = pub('fittingSlots.json') as Record<string, string>;
    const expected = Object.fromEntries(Object.entries(slots).filter(([, r]) => r !== 'drone'));
    expect(FITTING_RACKS).toEqual(expected);
  });
  it('matches public/data/mutaplasmids.json (result and bases)', () => {
    const muta = pub('mutaplasmids.json').mutaplasmids as Record<
      string,
      { result: number; bases: number[] }
    >;
    const expected = Object.values(muta).map((m) => ({ result: m.result, bases: m.bases }));
    expect([...MUTAPLASMID_BASES].sort((a, b) => a.result - b.result)).toEqual(
      expected.sort((a, b) => a.result - b.result)
    );
  });
});
