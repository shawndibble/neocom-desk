import { describe, it, expect } from 'vitest';
import type { ResolvedMaterial } from '@/engine/industry/materialResolution';
import { categoryForActivity, countJobsByCategory } from './planJobSlots';

const sub = (typeID: number, inputs: ResolvedMaterial[] = []) =>
  ({ subBuild: { typeID, inputs } }) as unknown as ResolvedMaterial;

describe('countJobsByCategory', () => {
  const catalog = {
    byProductTypeID: new Map([[100, { blueprint: { activity: 'reaction' } }]]),
  } as unknown as Parameters<typeof countJobsByCategory>[2];

  it('counts the top job plus every nested sub-build by pool', () => {
    const materials = [sub(1, [sub(100)]), sub(100), {} as ResolvedMaterial];
    expect(countJobsByCategory('manufacturing', materials, catalog)).toEqual({
      manufacturing: 2,
      science: 0,
      reaction: 2,
    });
  });

  it('maps a reaction plan to the reaction pool', () => {
    expect(categoryForActivity('reaction')).toBe('reaction');
  });
});
