import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import '@/i18n';
import { seedCharacter } from '@/test/seed';
import {
  DOCTRINE_FITS_TTL_MS,
  clearDoctrineFitsCache,
  useCorpDoctrineFittings,
} from './corpDoctrineFittings';

const listCorpDoctrineFits = vi.hoisted(() =>
  vi.fn(async () => [
    { id: 'a', name: 'Fleet Rifter', snapshot: { hullTypeId: 587 }, shareCode: '1.abc' },
  ])
);
vi.mock('@/features/corp/srpDoctrineClient', () => ({ listCorpDoctrineFits }));
vi.mock('@/sde/loadSde', () => ({
  loadTypes: async () => ({ '587': { name: 'Rifter' } }),
  loadFittingSlots: async () => new Map(),
}));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => true }));

const CORP = 98000001;

async function mountOnce(characterId: number) {
  const hook = renderHook(() => useCorpDoctrineFittings(characterId));
  await waitFor(() => expect(listCorpDoctrineFits).toHaveBeenCalled());
  return hook;
}

beforeEach(() => clearDoctrineFitsCache());

describe('useCorpDoctrineFittings', () => {
  it('reads the corp’s fits once per session window, and its refresh reads them again', async () => {
    listCorpDoctrineFits.mockClear();
    await seedCharacter(501, 'Pilot', { corporationId: CORP });
    (await mountOnce(501)).unmount();
    const again = renderHook(() => useCorpDoctrineFittings(501));
    await waitFor(() => expect(again.result.current.rows).toHaveLength(1));
    expect(again.result.current.settled).toBe(true);
    expect(listCorpDoctrineFits).toHaveBeenCalledTimes(1);

    await act(() => again.result.current.refresh());
    expect(listCorpDoctrineFits).toHaveBeenCalledTimes(2);
  });

  it('reads them again once the cached copy is older than the window', async () => {
    listCorpDoctrineFits.mockClear();
    await seedCharacter(502, 'Pilot', { corporationId: CORP });
    (await mountOnce(502)).unmount();
    const later = Date.now() + DOCTRINE_FITS_TTL_MS + 1;
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(later);
      renderHook(() => useCorpDoctrineFittings(502));
      await waitFor(() => expect(listCorpDoctrineFits).toHaveBeenCalledTimes(2));
    } finally {
      vi.useRealTimers();
    }
  });
});
