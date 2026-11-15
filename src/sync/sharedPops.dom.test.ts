import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getValidAccessToken } from '@/auth/session';
import { db } from '@/db';
import { callRouted } from './routedCallable';
import { ensureSignedIn } from './syncAuth';
import { fetchSharedPops, findSharedPop, type SharedPopView } from './sharedPops';

vi.mock('@/auth/session', () => ({ getValidAccessToken: vi.fn() }));
vi.mock('./routedCallable', () => ({ callRouted: vi.fn() }));
vi.mock('./syncAuth', () => ({ ensureSignedIn: vi.fn() }));

const pop = { id: '98000001_1000_1', moonId: 40001 } as SharedPopView;
const characters = (...ids: number[]) =>
  vi
    .spyOn(db.characters, 'toArray')
    .mockResolvedValue(ids.map((characterId) => ({ characterId })) as never);

beforeEach(() => {
  vi.mocked(callRouted)
    .mockReset()
    .mockResolvedValue({ pops: [pop] });
  vi.mocked(ensureSignedIn)
    .mockReset()
    .mockResolvedValue(undefined as never);
  vi.mocked(getValidAccessToken)
    .mockReset()
    .mockImplementation(async (id) => {
      if (id === 2) throw new Error('refresh failed');
      return `token-${id}`;
    });
});

describe('fetchSharedPops', () => {
  it('signs with the first Character and proves the others with their tokens', async () => {
    characters(1, 2, 3);
    await expect(fetchSharedPops()).resolves.toEqual([pop]);
    expect(ensureSignedIn).toHaveBeenCalledWith(1);
    expect(callRouted).toHaveBeenCalledWith(
      'listSharedPopsCallable',
      { accessTokens: ['token-3'] },
      1
    );
  });

  it('asks nothing without a Character holding a token', async () => {
    characters(2);
    await expect(fetchSharedPops()).resolves.toEqual([]);
    expect(callRouted).not.toHaveBeenCalled();
  });

  it('finds the pop a deep link names', () => {
    expect(findSharedPop([pop], '98000001_1000_1')).toBe(pop);
    expect(findSharedPop([pop], 'nope')).toBeUndefined();
  });
});
