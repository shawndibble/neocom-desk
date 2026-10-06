import { describe, it, expect } from 'vitest';
import type { PiData } from '@/sde/types';
import { piTypeNames } from './coloniesNames';

const pi = {
  raw: [{ typeID: 2267, name: 'Base Metals' }],
  schematics: { '2389': { name: 'Coolant' } },
} as unknown as PiData;

describe('piTypeNames', () => {
  it('names raw resources and schematic products from pi.json', () => {
    const names = piTypeNames(pi);
    expect(names.get(2267)).toBe('Base Metals');
    expect(names.get(2389)).toBe('Coolant');
  });
  it('is empty without pi data', () => {
    expect(piTypeNames(null).size).toBe(0);
  });
});
