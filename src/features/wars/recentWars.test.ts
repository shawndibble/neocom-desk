import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadRecentWars, RECENT_WAR_IDS, resetRecentWarsCache } from './recentWars';

const getWarIds = vi.fn();
const getWar = vi.fn();
vi.mock('@/esi/endpoints', () => ({
  getWarIds: () => getWarIds(),
  getWar: (id: number) => getWar(id),
}));

const esiWar = (id: number) => ({
  id,
  declared: '2026-10-20T06:00:00Z',
  mutual: false,
  open_for_allies: false,
  aggressor: { corporation_id: 1, isk_destroyed: 0, ships_killed: 0 },
  defender: { corporation_id: 2, isk_destroyed: 0, ships_killed: 0 },
});

beforeEach(() => {
  resetRecentWarsCache();
  getWarIds.mockReset();
  getWar.mockReset();
});

describe('loadRecentWars', () => {
  it('reads only the newest ids and parses each war', async () => {
    const ids = Array.from({ length: RECENT_WAR_IDS + 25 }, (_, i) => 1000 - i);
    getWarIds.mockResolvedValue({ data: ids });
    getWar.mockImplementation(async (id: number) => ({ data: esiWar(id) }));
    const wars = await loadRecentWars();
    expect(wars).toHaveLength(RECENT_WAR_IDS);
    expect(getWar).toHaveBeenCalledTimes(RECENT_WAR_IDS);
    expect(wars.map((war) => war.id)).toContain(1000);
  });

  it('keeps the wars that read when one will not', async () => {
    getWarIds.mockResolvedValue({ data: [3, 2, 1] });
    getWar.mockImplementation(async (id: number) => {
      if (id === 2) throw new Error('500');
      return { data: esiWar(id) };
    });
    expect((await loadRecentWars()).map((war) => war.id).sort()).toEqual([1, 3]);
  });

  it('does not read again inside the window', async () => {
    getWarIds.mockResolvedValue({ data: [1] });
    getWar.mockResolvedValue({ data: esiWar(1) });
    await loadRecentWars();
    await loadRecentWars();
    expect(getWarIds).toHaveBeenCalledTimes(1);
  });

  it('is empty when ESI cannot list wars, and tries again next time', async () => {
    getWarIds.mockRejectedValueOnce(new Error('offline'));
    expect(await loadRecentWars()).toEqual([]);
    getWarIds.mockResolvedValue({ data: [1] });
    getWar.mockResolvedValue({ data: esiWar(1) });
    expect(await loadRecentWars()).toHaveLength(1);
  });
});
