// The router actions are plain strings on both sides, so a typo only shows up at
// runtime as `invalid-argument`. These read the sources and compare the two sets.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const index = readFileSync(join(__dirname, 'index.ts'), 'utf8');
const registrations = [
  ...index.matchAll(/export const (\w+) = (communityCallable|corpTaxBookCallable)\(\s*'(\w+)'/g),
];

function clientSources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return clientSources(path);
    return /\.tsx?$/.test(entry) && !/\.(test|stories)\./.test(entry) ? [path] : [];
  });
}

describe('callable router names', () => {
  it('registers every callable under its own export name', () => {
    expect(registrations.length).toBeGreaterThan(60);
    for (const [, exported, , action] of registrations) expect(action).toBe(exported);
  });

  it('serves every community and Corp Tax Book callable through a router', () => {
    const routed = new Set(registrations.map((m) => m[1]));
    const loose = [
      ...index.matchAll(
        /export const (\w+(?:Communit|CorpTaxBook|CorpOfficer)\w*Callable) = onCall/g
      ),
    ];
    expect(loose.map((m) => m[1]).filter((n) => !routed.has(n))).toEqual([]);
  });

  it('is called by the client only with registered action names', () => {
    const registered = new Set(registrations.map((m) => m[3]));
    const used = new Set<string>();
    for (const file of clientSources(join(__dirname, '../../src'))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(
        /'((?:\w*Communit\w*|\w*CorpTaxBook\w*|verifyCorpOfficer)Callable)'/g
      )) {
        used.add(m[1]);
      }
    }
    expect(used.size).toBeGreaterThan(20);
    expect([...used].filter((name) => !registered.has(name))).toEqual([]);
  });
});
