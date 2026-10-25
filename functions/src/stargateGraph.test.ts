import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STARGATES, SYSTEM_SECURITY } from './data/stargateGraph.js';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const pub = (name: string) => JSON.parse(text(`../../public/data/market/${name}`));

// functions/ cannot import public/, so it keeps a copy (scripts/build-stargate-data.mjs).
describe('stargateGraph copy', () => {
  it('matches public/data/market/jumps.json', () => {
    expect(STARGATES).toEqual(pub('jumps.json'));
  });
  it("holds each gated system's raw security from systems.json", () => {
    const systems = pub('systems.json') as { id: number; security: number }[];
    const expected = Object.fromEntries(
      systems.filter((s) => String(s.id) in STARGATES).map((s) => [String(s.id), s.security])
    );
    expect(SYSTEM_SECURITY).toEqual(expected);
  });
});

describe('jumpRoute mirror', () => {
  it('matches src/engine/route/jumpRoute.ts', () => {
    const mirror = text('./jumpRoute.ts').split('\n').slice(1).join('\n');
    expect(mirror).toBe(text('../../src/engine/route/jumpRoute.ts'));
  });
});
