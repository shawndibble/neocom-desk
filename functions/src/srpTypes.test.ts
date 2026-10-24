import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as book from './corpTaxBook.js';
import * as feederPayouts from './corpTaxBookFeederPayouts.js';
import * as feederView from './corpTaxBookFeederView.js';
import * as srp from './srpTypes.js';

// deleteBook keeps every `corps/{id}` subcollection named in SRP_COLLECTIONS and deletes
// the rest, so an SRP collection missing from the list would be wiped with the book (#4939).

const here = dirname(fileURLToPath(import.meta.url));
const exported = srp as unknown as Record<string, unknown>;

/** Every `.collection(...)` argument in the non-test SRP sources, as a resolved name. */
function srpSourceCollections(): string[] {
  const names = new Set<string>();
  for (const file of readdirSync(here)) {
    if (!/^srp.*\.ts$/.test(file) || file.endsWith('.test.ts')) continue;
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

describe('SRP_COLLECTIONS', () => {
  it('names every SRP_* collection constant', () => {
    const constants = Object.entries(exported)
      .filter(([key, value]) => key.startsWith('SRP_') && typeof value === 'string')
      .filter(([key]) => key !== 'SRP_SETTINGS_DOC')
      .map(([, value]) => value);
    expect([...srp.SRP_COLLECTIONS].sort()).toEqual([...constants].sort());
  });

  it('names every collection the SRP code writes under corps/{id}', () => {
    const used = srpSourceCollections().filter((name) => name !== srp.CORPS_COLLECTION);
    expect(used.length).toBeGreaterThan(0);
    for (const name of used) expect(srp.SRP_COLLECTIONS).toContain(name);
  });

  it('shares no name with a Corp Tax Book collection', () => {
    const bookNames = [book, feederPayouts, feederView].flatMap((mod) =>
      Object.values(mod).filter((value): value is string => typeof value === 'string')
    );
    for (const name of srp.SRP_COLLECTIONS) expect(bookNames).not.toContain(name);
  });
});
