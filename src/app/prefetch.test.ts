import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db';
import { ESI_REGISTRY, isScopeRequired } from '@/esi/registry';
import {
  PREFETCH_TASKS,
  prefetchTasksFor,
  prefetchCharacterData,
  type PrefetchTask,
} from './prefetch';
import { usePrefetch, isPrefetching } from '@/stores/prefetch';

const CHAR_ID = 91;

/** Every scope the full task table asks for — a Character that granted everything. */
const ALL_SCOPES = [
  ...new Set(
    PREFETCH_TASKS.flatMap((task) =>
      task.endpoints.map((endpoint) => ESI_REGISTRY[endpoint].scope).filter(isScopeRequired)
    )
  ),
];

beforeEach(async () => {
  await db.tokens.clear();
  usePrefetch.getState().finish();
});

describe('prefetchTasksFor', () => {
  it('runs nothing for a Character with no granted scopes', () => {
    // Not "everything": an unfiltered warm-up 403s its way to a spurious
    // app-wide re-auth banner at boot, which is the whole point of the gate.
    expect(prefetchTasksFor([])).toEqual([]);
  });

  it('runs every task for a Character that granted every scope', () => {
    expect(prefetchTasksFor(ALL_SCOPES)).toHaveLength(PREFETCH_TASKS.length);
  });

  it('drops only the tasks whose scope is missing', () => {
    const withoutMail = ALL_SCOPES.filter((scope) => !scope.startsWith('esi-mail'));
    const ids = prefetchTasksFor(withoutMail).map((task) => task.id);

    expect(ids).not.toContain('mail-headers');
    expect(ids).not.toContain('mail-labels');
    expect(ids).toContain('skills');
    expect(ids).toContain('assets');
  });

  it('requires every scope a multi-endpoint task touches, not just one', () => {
    const planets = PREFETCH_TASKS.find((task) => task.id === 'planets');
    expect(planets?.endpoints.length).toBeGreaterThan(1);

    // PI's two endpoints share one scope today, so exercise the "all, not any"
    // rule against a task built to have two distinct ones.
    const twoScopes: PrefetchTask = {
      id: 'two-scopes',
      endpoints: ['getCharacterSkills', 'getCharacterAssets'],
      run: async () => {},
    };
    const onlySkills = ['esi-skills.read_skills.v1'];

    expect(prefetchTasksFor(onlySkills, [twoScopes])).toEqual([]);
  });

  it('keeps a public-only task regardless of grant', () => {
    const publicTask: PrefetchTask = {
      id: 'public',
      endpoints: ['getUniverseType'],
      run: async () => {},
    };

    expect(prefetchTasksFor([], [publicTask])).toEqual([publicTask]);
  });

  it('preserves table order, which is the run priority', () => {
    const ids = prefetchTasksFor(ALL_SCOPES).map((task) => task.id);
    expect(ids.indexOf('skills')).toBeLessThan(ids.indexOf('assets'));
  });
});

describe('prefetchCharacterData', () => {
  it('does nothing when the Character has no token row', async () => {
    const task = { id: 'x', endpoints: [], run: vi.fn(async () => {}) };
    vi.spyOn(db.tokens, 'get').mockResolvedValue(undefined);

    await prefetchCharacterData(CHAR_ID);

    expect(task.run).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('leaves the progress store idle once the run settles', async () => {
    await prefetchCharacterData(CHAR_ID);

    expect(isPrefetching(usePrefetch.getState())).toBe(false);
  });

  it('stops starting tasks once the run is cancelled', async () => {
    await db.tokens.put({
      characterId: CHAR_ID,
      refreshToken: 'r',
      accessToken: 'a',
      expiresAt: Date.now() + 60_000,
      scopes: [...ALL_SCOPES],
    });
    const signal = { cancelled: true };

    await prefetchCharacterData(CHAR_ID, signal);

    expect(isPrefetching(usePrefetch.getState())).toBe(false);
  });
});
