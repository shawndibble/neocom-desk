import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PilotKillmail } from '@/lib/zkillboard';

const mocks = vi.hoisted(() => ({
  getKillmail: vi.fn(),
  loadFittingSlots: vi.fn(),
  typeName: vi.fn(),
}));

vi.mock('@/esi/endpoints', () => ({ getKillmail: mocks.getKillmail }));
vi.mock('@/sde/loadSde', () => ({
  loadFittingSlots: mocks.loadFittingSlots,
  typeName: mocks.typeName,
}));

import { loadKillmailFit } from './pilotKillmailFit';

const VICTIM = {
  character_id: 900,
  corporation_id: 901,
  ship_type_id: 626,
  items: [
    { item_type_id: 100, flag: 27, quantity_destroyed: 1, singleton: 0 },
    { item_type_id: 200, flag: 11, quantity_dropped: 1, singleton: 0 },
  ],
};

const DETAIL = {
  time: '2026-09-01T12:00:00Z',
  systemId: 30000142,
  victim: { ship_type_id: 626, items: VICTIM.items },
  victimParty: { characterId: 900, corporationId: 901, shipTypeId: 626 },
  finalBlow: null,
};

function entry(detail: PilotKillmail['detail']): PilotKillmail {
  return { killmailId: 7, hash: 'aa', side: 'loss', value: 1000, detail };
}

describe('loadKillmailFit', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.loadFittingSlots.mockResolvedValue({ 100: 'high', 200: 'low' });
    mocks.typeName.mockResolvedValue('Vexor');
  });

  it('reads an inline victim without asking ESI', async () => {
    const result = await loadKillmailFit(entry(DETAIL));
    expect(mocks.getKillmail).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fitting?.name).toBe('Vexor');
    expect(result.fitting?.shipTypeId).toBe(626);
    expect(result.fitting?.modules.map((m) => [m.slot, m.typeId])).toEqual([
      ['high', 100],
      ['low', 200],
    ]);
  });

  it('reads a hash-only entry from ESI with its hash, and returns the detail it read', async () => {
    mocks.getKillmail.mockResolvedValue({
      data: {
        killmail_id: 7,
        killmail_time: '2026-09-01T12:00:00Z',
        solar_system_id: 30000142,
        victim: VICTIM,
        attackers: [{ character_id: 42, ship_type_id: 11, final_blow: true }],
      },
    });
    const result = await loadKillmailFit(entry(null));
    expect(mocks.getKillmail).toHaveBeenCalledWith(7, 'aa');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.detail.systemId).toBe(30000142);
    expect(result.detail.finalBlow?.characterId).toBe(42);
    expect(result.fitting?.modules).toHaveLength(2);
  });

  it('fails when ESI cannot supply the killmail', async () => {
    mocks.getKillmail.mockRejectedValue(new Error('offline'));
    expect(await loadKillmailFit(entry(null))).toEqual({ ok: false });
    mocks.getKillmail.mockResolvedValue({ data: null });
    expect(await loadKillmailFit(entry(null))).toEqual({ ok: false });
  });
});
