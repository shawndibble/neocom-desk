import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type TokenRecord } from '@/db';
import type { CorpManufactureProject } from '@/engine/corpProjects/corpProjects';

const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('./corpProjectsData', () => ({ loadCorpManufactureProjects: load }));

import { useCorpProjects } from './useCorpProjects';

const SCOPE = 'esi-corporations.read_projects.v1';
const project: CorpManufactureProject = {
  id: 'p1',
  name: 'Hulls',
  typeId: 24702,
  rewardEach: 100,
  poolInitial: 1000,
  poolRemaining: 1000,
  cap: 5,
  contributed: 0,
  expires: null,
};

async function seed(characterId: number, corporationId: number | undefined, scopes: string[]) {
  await db.characters.put({
    characterId,
    name: `Pilot ${characterId}`,
    ownerHash: `h${characterId}`,
    addedAt: 1,
    ...(corporationId === undefined ? {} : { corporationId }),
  });
  await db.tokens.put({
    characterId,
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 600_000,
    scopes,
  } as TokenRecord);
}

describe('useCorpProjects', () => {
  beforeEach(async () => {
    load.mockReset();
    await Promise.all([db.characters.clear(), db.tokens.clear()]);
  });

  it('reads once per Character that holds the permission and a corporation', async () => {
    await seed(1, 500, [SCOPE]);
    await seed(2, 500, []); // no permission
    await seed(3, undefined, [SCOPE]); // no corporation
    load.mockResolvedValue({
      cached: { data: [project], fetchedAt: new Date(), fromCache: false, truncated: false },
      needsReauth: false,
    });

    const { result } = renderHook(() => useCorpProjects([1, 2, 3]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(1, 500);
    expect(result.current.entries).toEqual([
      { characterId: 1, corporationId: 500, projects: [project] },
    ]);
  });

  it('drops a Character whose read failed or came back empty, so the view can hide', async () => {
    await seed(1, 500, [SCOPE]);
    await seed(2, 600, [SCOPE]);
    load.mockImplementation(async (characterId: number) =>
      characterId === 1
        ? { cached: null, needsReauth: true }
        : {
            cached: { data: [], fetchedAt: new Date(), fromCache: false, truncated: false },
            needsReauth: false,
          }
    );

    const { result } = renderHook(() => useCorpProjects([1, 2]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toEqual([]);
  });

  it('does not read at all with no Character in scope', async () => {
    const { result } = renderHook(() => useCorpProjects([]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(load).not.toHaveBeenCalled();
    expect(result.current.entries).toEqual([]);
  });
});
