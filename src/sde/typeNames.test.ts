import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameItemLookup } from '@/engine/fittings/fitCurrency';

/**
 * The shipped `typeNames.json`, read as the Workbench's out-of-date check
 * reads it: every name the game has, so an item the loader's catalogue
 * leaves out is never called removed.
 */
function shipped<T>(file: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'public/data', file), 'utf8')) as T;
}

const isGameItem = gameItemLookup(shipped<string[]>('typeNames.json'));

describe('typeNames.json', () => {
  it.each([
    'Fierce Exotic Filament',
    'Cataclysmic Electrical Filament',
    'Raging Gamma Filament',
    'Agitated Exotic Filament',
    'Calm Exotic Filament',
    'Tranquil Exotic Filament',
    "Agency 'Hardshell' TB5 Dose II",
    "Agency 'Overclocker' SB3 Dose I",
    'Large Abyssal Shield Extender',
  ])('has %s, which the Workbench once called removed', (name) => {
    expect(isGameItem(name)).toBe(true);
  });

  it('has every name the other SDE files carry', () => {
    const names = [
      ...Object.values(shipped<Record<string, { name: string }>>('types.json')).map((t) => t.name),
      ...shipped<{ name: string }[]>('market/types.json').map((t) => t.name),
      ...shipped<{ name: string }[]>('skills.json').map((t) => t.name),
    ];
    expect(names.filter((name) => !isGameItem(name))).toEqual([]);
  });
});
