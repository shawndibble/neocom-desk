import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { canMakeWith, planetsNeeded, rawInputsOf } from './productPlanets';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;
const idOf = (name: string) => {
  const raw = pi.raw.find((r) => r.name === name);
  if (raw) return raw.typeID;
  return Number(Object.entries(pi.schematics).find(([, s]) => s.name === name)?.[0]);
};

describe('productPlanets', () => {
  it('a raw is its own input and needs one planet', () => {
    const felsic = idOf('Felsic Magma');
    expect(rawInputsOf(felsic, pi)).toEqual([felsic]);
    expect(planetsNeeded(felsic, pi)).toBe(1);
  });

  it('a one-planet P1 needs one planet', () => {
    expect(planetsNeeded(idOf('Silicon'), pi)).toBe(1);
  });

  it('a P2 whose inputs live on different planet types can still be one planet', () => {
    // Coolant is made from Electrolytes + Water; both have a shared host.
    expect(planetsNeeded(idOf('Coolant'), pi)).toBe(1);
  });

  it('a P4 needs several planets', () => {
    const n = planetsNeeded(idOf('Broadcast Node'), pi);
    expect(n).not.toBeNull();
    expect(n).toBeGreaterThan(1);
  });

  it('canMakeWith follows the planet types on offer', () => {
    const silicon = idOf('Silicon');
    expect(canMakeWith(silicon, pi, new Set(['lava']))).toBe(true);
    expect(canMakeWith(silicon, pi, new Set(['gas']))).toBe(false);
    expect(canMakeWith(silicon, pi, new Set())).toBe(false);
  });
});
