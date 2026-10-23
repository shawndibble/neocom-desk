// The router actions are plain strings on both sides, so a typo only shows up at
// runtime as `invalid-argument`. These read the sources and compare the two sets.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const index = readFileSync(join(__dirname, 'index.ts'), 'utf8');
const registrations = [
  ...index.matchAll(/^(communityAction|corpTaxBookAction|alertsAction)\(\s*'(\w+)'/gm),
];

function clientSources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return clientSources(path);
    return /\.tsx?$/.test(entry) && !/\.(test|stories)\./.test(entry) ? [path] : [];
  });
}

describe('callable router names', () => {
  it('registers every action once, including the device and grant ones', () => {
    const names = registrations.map((m) => m[2]);
    expect(names.length).toBeGreaterThan(60);
    expect(names).toEqual(
      expect.arrayContaining(['registerDevice', 'saveAlertGrant', 'deleteAlertGrant'])
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it('deploys no per-name community, Corp Tax Book, SRP or alerts callable', () => {
    const loose = [
      ...index.matchAll(
        /^export const (\w*(?:Communit|CorpTaxBook|CorpOfficer|Srp)\w*Callable|registerDevice|saveAlertGrant|deleteAlertGrant) =/gm
      ),
    ];
    expect(loose.map((m) => m[1])).toEqual([]);
  });

  it('is called by the client only with registered action names', () => {
    const registered = new Set(registrations.map((m) => m[2]));
    const used = new Set<string>();
    for (const file of clientSources(join(__dirname, '../../src'))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(
        /'((?:\w*Communit\w*|\w*CorpTaxBook\w*|\w*Srp\w*|verifyCorpOfficer)Callable|registerDevice|saveAlertGrant|deleteAlertGrant)'/g
      )) {
        used.add(m[1]);
      }
    }
    expect(used.size).toBeGreaterThan(20);
    expect([...used].filter((name) => !registered.has(name))).toEqual([]);
  });
});
