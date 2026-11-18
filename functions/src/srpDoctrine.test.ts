import { describe, it, expect } from 'vitest';
import { matchDoctrine } from './srpDoctrine.js';

describe('srpDoctrine', () => {
  it('runs', () => {
    expect(matchDoctrine({ hullTypeId: 1, modules: [], rigs: [] }, [])).toEqual({
      status: 'not-checked',
    });
  });
});
