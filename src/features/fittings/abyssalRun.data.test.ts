import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ABYSSAL_WEATHER_KINDS } from '@/engine/fittings/abyssalWeather';
import {
  ABYSSAL_TIERS,
  abyssalFilamentTypeId,
  abyssalHullRule,
} from '@/engine/fittings/abyssalRun';
import type { TypeMap } from '@/sde/types';

const types = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/types.json'), 'utf8')
) as TypeMap;

describe('the Abyssal run tables against the pinned SDE', () => {
  it('names every filament "<Tier> <Weather> Filament"', () => {
    for (const { tier, name } of ABYSSAL_TIERS) {
      for (const kind of ABYSSAL_WEATHER_KINDS) {
        const typeName = types[String(abyssalFilamentTypeId(tier, kind))]?.name;
        expect(typeName).toBe(`${name} ${kind[0]!.toUpperCase()}${kind.slice(1)} Filament`);
      }
    }
  });

  it('puts famous hulls in the class they are known for', () => {
    const rule = (name: string) => {
      const entry = Object.values(types).find((type) => type.name === name);
      return abyssalHullRule(entry?.groupID);
    };
    expect(rule('Caracal')).toMatchObject({ shipClass: 'cruiser' });
    expect(rule('Gila')).toMatchObject({ shipClass: 'cruiser' });
    expect(rule('Proteus')).toEqual({ eligible: false, reason: 'tech3Cruiser' });
    expect(rule('Svipul')).toMatchObject({ shipClass: 'destroyer' });
    expect(rule('Merlin')).toMatchObject({ shipClass: 'frigate' });
    expect(rule('Raven')).toEqual({ eligible: false, reason: 'tooLarge' });
  });
});
