import { describe, expect, it } from 'vitest';
import { rootMarketGroup } from './assetCategories';

const groups = new Map([
  [1, { id: 1, name: 'Ships', parentId: null, hasTypes: false }],
  [2, { id: 2, name: 'Frigates', parentId: 1, hasTypes: false }],
  [3, { id: 3, name: 'Standard', parentId: 2, hasTypes: true }],
  [8, { id: 8, name: 'A', parentId: 9, hasTypes: false }],
  [9, { id: 9, name: 'B', parentId: 8, hasTypes: false }],
]);

describe('rootMarketGroup', () => {
  it('walks to the top of the ancestry', () => {
    expect(rootMarketGroup(groups, 3)?.name).toBe('Ships');
    expect(rootMarketGroup(groups, 1)?.name).toBe('Ships');
  });
  it('knows nothing of an unknown group', () => {
    expect(rootMarketGroup(groups, 99)).toBeNull();
  });
  it('stops on a parent cycle instead of hanging', () => {
    expect(rootMarketGroup(groups, 8)).not.toBeUndefined();
  });
});
