import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VETTING_CHECKS, assessVetting } from './vettingEngine.js';

describe('vettingEngine mirror', () => {
  it('matches src/engine/vetting.ts', () => {
    const body = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
    const mirror = body('./vettingEngine.ts').split('\n').slice(1).join('\n');
    expect(mirror).toBe(body('../../src/engine/vetting.ts'));
  });

  it('runs under the functions build', () => {
    const { flags, checks } = assessVetting({ now: 0, characters: [], parties: [], watchlist: [] });
    expect(flags).toEqual([]);
    expect(checks.map((check) => check.check)).toEqual([...VETTING_CHECKS]);
  });
});
