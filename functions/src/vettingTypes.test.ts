import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as book from './corpTaxBook.js';
import { UNVERSIONED_COLLECTIONS } from './corpTaxBookVersionKeys.js';
import * as feederPayouts from './corpTaxBookFeederPayouts.js';
import * as feederView from './corpTaxBookFeederView.js';
import { CORPS_COLLECTION, SRP_COLLECTIONS } from './srpTypes.js';
import * as vetting from './vettingTypes.js';

const here = dirname(fileURLToPath(import.meta.url));
const exported = { ...vetting, CORPS_COLLECTION } as unknown as Record<string, unknown>;

function sourceCollections(): string[] {
  const names = new Set<string>();
  for (const file of readdirSync(here)) {
    if (!/^vetting.*\.ts$/.test(file) || file.endsWith('.test.ts')) continue;
    const source = readFileSync(join(here, file), 'utf8');
    for (const [, arg] of source.matchAll(/\.collection\(\s*([^)]+?)\s*\)/g)) {
      const literal = /^['"`]([^'"`]+)['"`]$/.exec(arg);
      const name = literal ? literal[1] : exported[arg];
      if (typeof name !== 'string')
        throw new Error(`${file}: .collection(${arg}) is not resolvable`);
      names.add(name);
    }
  }
  return [...names];
}

describe('VETTING_COLLECTIONS', () => {
  it('names every collection the vetting code keeps directly under corps/{id}', () => {
    const used = sourceCollections().filter(
      (name) =>
        name !== CORPS_COLLECTION && name !== vetting.VETTING_INPUTS && name !== vetting.VETTING_RAW
    );
    expect([...used].sort()).toEqual([...vetting.VETTING_COLLECTIONS].sort());
  });

  it('shares no name with a Corp Tax Book or SRP collection', () => {
    const taken = [
      ...SRP_COLLECTIONS,
      ...[book, feederPayouts, feederView].flatMap((mod) =>
        Object.values(mod).filter((value): value is string => typeof value === 'string')
      ),
    ];
    for (const name of vetting.VETTING_COLLECTIONS) expect(taken).not.toContain(name);
  });

  it('moves no Corp Tax Book version stamp', () => {
    for (const name of vetting.VETTING_COLLECTIONS) {
      expect(UNVERSIONED_COLLECTIONS.has(name)).toBe(true);
    }
  });
});
