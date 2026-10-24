import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { matchDoctrine } from './srpDoctrine.js';

describe('srpDoctrine mirror', () => {
  it('matches src/engine/srpDoctrine.ts', () => {
    const body = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
    const mirror = body('./srpDoctrine.ts').split('\n').slice(1).join('\n');
    expect(mirror).toBe(body('../../src/engine/srpDoctrine.ts'));
  });
  it('runs', () => {
    expect(matchDoctrine({ hullTypeId: 1, modules: [], rigs: [] }, [])).toEqual({
      status: 'not-checked',
    });
  });
});
