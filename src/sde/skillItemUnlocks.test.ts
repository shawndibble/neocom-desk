import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Drift guard: the committed file is what `scripts/lib/skillItemUnlocks.mjs` bakes.
const read = <T>(name: string) =>
  JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', name), 'utf-8')) as T;
const types = read<Record<string, { name: string }>>('types.json');
const idOf = (name: string) =>
  Number(Object.entries(types).find(([, type]) => type.name === name)?.[0]);
const skillIdOf = (name: string) =>
  read<{ typeID: number; name: string }[]>('skills.json').find((s) => s.name === name)?.typeID;

describe('committed skillItemUnlocks.json', () => {
  const unlocks = read<Record<string, [number, number][]>>('skillItemUnlocks.json');

  it('puts the Rifter under Minmatar Frigate I and a T2 autocannon under Small Projectile Turret V', () => {
    expect(unlocks[String(skillIdOf('Minmatar Frigate'))]).toContainEqual([idOf('Rifter'), 1]);
    expect(unlocks[String(skillIdOf('Small Projectile Turret'))]).toContainEqual([
      idOf('125mm Gatling AutoCannon II'),
      5,
    ]);
  });

  it('lists no skills (skills.json prereqs carry those) and keeps ids sorted', () => {
    const skillIds = new Set(read<{ typeID: number }[]>('skills.json').map((s) => s.typeID));
    for (const pairs of Object.values(unlocks)) {
      expect(pairs.some(([id]) => skillIds.has(id))).toBe(false);
      expect(pairs.map(([id]) => id)).toEqual(pairs.map(([id]) => id).sort((a, b) => a - b));
    }
  });
});
