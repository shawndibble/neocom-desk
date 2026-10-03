import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KillmailVictim } from '@/engine/fittings/linkLoader';

const { fetchHullLossesMock, getKillmailMock } = vi.hoisted(() => ({
  fetchHullLossesMock: vi.fn(),
  getKillmailMock: vi.fn(),
}));
vi.mock('@/lib/zkillboard', () => ({ fetchHullLosses: fetchHullLossesMock }));
vi.mock('@/esi/endpoints', () => ({ getKillmail: getKillmailMock }));
vi.mock('@/sde/loadSde', () => ({
  loadFittingSlots: () => Promise.resolve({ 100: 'high', 200: 'medium', 300: 'low' }),
}));

import { loadPopularFits, resetPopularFitsCache } from './popularFits';

const VICTIM: KillmailVictim = {
  ship_type_id: 626,
  items: [
    { item_type_id: 100, flag: 27, quantity_destroyed: 1, singleton: 0 },
    { item_type_id: 200, flag: 19, quantity_destroyed: 1, singleton: 0 },
    { item_type_id: 300, flag: 11, quantity_dropped: 1, singleton: 0 },
  ],
};

describe('loadPopularFits', () => {
  beforeEach(() => {
    resetPopularFitsCache();
    fetchHullLossesMock.mockReset();
    getKillmailMock.mockReset();
  });

  it('uses an inline victim and reads a hash-only loss from ESI', async () => {
    fetchHullLossesMock.mockResolvedValue({
      ok: true,
      losses: [
        { killmailId: 2, hash: 'b', value: 10, time: '2026-09-02T00:00:00Z', victim: VICTIM },
        { killmailId: 1, hash: 'a', value: 30, time: null, victim: null },
      ],
    });
    getKillmailMock.mockResolvedValue({
      data: { killmail_id: 1, killmail_time: '2026-09-01T00:00:00Z', victim: VICTIM },
    });

    const result = await loadPopularFits(626, 0);
    expect(getKillmailMock).toHaveBeenCalledTimes(1);
    expect(getKillmailMock).toHaveBeenCalledWith(1, 'a');
    expect(result).toMatchObject({
      ok: true,
      fits: [{ count: 2, value: 20, lastSeen: '2026-09-02T00:00:00Z', killmailIds: [2, 1] }],
    });
  });

  it('skips a killmail ESI fails on, and fails only when every one does', async () => {
    fetchHullLossesMock.mockResolvedValue({
      ok: true,
      losses: [
        { killmailId: 2, hash: 'b', value: null, time: null, victim: null },
        { killmailId: 1, hash: 'a', value: null, time: null, victim: null },
      ],
    });
    getKillmailMock
      .mockRejectedValueOnce(new Error('502'))
      .mockResolvedValueOnce({ data: { killmail_id: 1, victim: VICTIM } });
    expect(await loadPopularFits(626, 0)).toMatchObject({ ok: true, fits: [{ count: 1 }] });

    resetPopularFitsCache();
    getKillmailMock.mockRejectedValue(new Error('502'));
    expect(await loadPopularFits(626, 0)).toEqual({ ok: false });
  });

  it('reports a zKillboard failure, and does not cache it', async () => {
    fetchHullLossesMock.mockResolvedValue({ ok: false, losses: [] });
    expect(await loadPopularFits(626, 0)).toEqual({ ok: false });
    fetchHullLossesMock.mockResolvedValue({ ok: true, losses: [] });
    expect(await loadPopularFits(626, 1)).toEqual({ ok: true, fits: [] });
  });

  it('holds a good result for ten minutes per hull', async () => {
    fetchHullLossesMock.mockResolvedValue({ ok: true, losses: [] });
    await loadPopularFits(626, 0);
    await loadPopularFits(626, 9 * 60_000);
    expect(fetchHullLossesMock).toHaveBeenCalledTimes(1);
    await loadPopularFits(627, 9 * 60_000);
    await loadPopularFits(626, 11 * 60_000);
    expect(fetchHullLossesMock).toHaveBeenCalledTimes(3);
  });

  it('shares one load between callers asking for the same hull at once', async () => {
    let settle: (value: unknown) => void = () => undefined;
    fetchHullLossesMock.mockReturnValue(new Promise((resolve) => (settle = resolve)));
    const first = loadPopularFits(626, 0);
    const second = loadPopularFits(626, 0);
    settle({ ok: true, losses: [] });
    expect(await first).toEqual({ ok: true, fits: [] });
    expect(await second).toEqual({ ok: true, fits: [] });
    expect(fetchHullLossesMock).toHaveBeenCalledTimes(1);
  });
});
