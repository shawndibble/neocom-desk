import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { prefetchCharacterData, DERIVED_PREFETCH_TASKS, type PrefetchTask } from './prefetch';

const gate = vi.hoisted(() => ({ level: 'all' }));
vi.mock('@/lib/lazyAssetWarmGate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/lazyAssetWarmGate')>()),
  currentWarmLevel: () => gate.level,
}));

const CHAR_ID = 92;

beforeEach(async () => {
  gate.level = 'all';
  await db.tokens.clear();
  await db.tokens.put({
    characterId: CHAR_ID,
    refreshToken: 'r',
    accessToken: 'a',
    expiresAt: Date.now() + 60_000,
    scopes: [],
  });
});

describe('derived prefetch phase', () => {
  it('lists the lookup warm-ups', () => {
    expect(DERIVED_PREFETCH_TASKS.map((t) => t.id)).toEqual([
      'names',
      'structure-names',
      'loyalty-stores',
      'implant-types',
    ]);
  });

  it('runs only after every list task has finished', async () => {
    const order: string[] = [];
    const list: PrefetchTask = {
      id: 'list',
      endpoints: [],
      run: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push('list');
      },
    };
    const derived: PrefetchTask = {
      id: 'derived',
      endpoints: [],
      run: async () => {
        order.push('derived');
      },
    };
    await prefetchCharacterData(CHAR_ID, { cancelled: false }, [list], [derived]);
    expect(order).toEqual(['list', 'derived']);
  });

  it('skips the derived tasks on a restricted connection but still runs the lists', async () => {
    gate.level = 'none';
    const list = vi.fn(async () => {});
    const derived = vi.fn(async () => {});
    await prefetchCharacterData(
      CHAR_ID,
      { cancelled: false },
      [{ id: 'list', endpoints: [], run: list }],
      [{ id: 'derived', endpoints: [], run: derived }]
    );
    expect(list).toHaveBeenCalled();
    expect(derived).not.toHaveBeenCalled();
  });

  it('a failing derived task does not stop the others', async () => {
    const second = vi.fn(async () => {});
    await prefetchCharacterData(
      CHAR_ID,
      { cancelled: false },
      [{ id: 'list', endpoints: [], run: async () => {} }],
      [
        {
          id: 'a',
          endpoints: [],
          run: async () => {
            throw new Error('x');
          },
        },
        { id: 'b', endpoints: [], run: second },
      ]
    );
    expect(second).toHaveBeenCalled();
  });
});

describe('derived task scope gating', () => {
  it('drops structure and implant warm-ups when their scopes are missing', async () => {
    const { prefetchTasksFor } = await import('./prefetch');
    const ids = prefetchTasksFor([], DERIVED_PREFETCH_TASKS).map((t) => t.id);
    expect(ids).toEqual(['names']);
  });
});
