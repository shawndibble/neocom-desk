import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PilotKillmail } from '@/lib/zkillboard';

const fetchPilotKillmailHistory = vi.fn();
vi.mock('@/lib/zkillboard', () => ({
  fetchPilotKillmailHistory: (id: number) => fetchPilotKillmailHistory(id),
}));
vi.mock('./pollDomains/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pollDomains/shared')>()),
  currentThresholds: async () => ({ shipLostMinimumIsk: 5_000_000 }),
}));

import { killsDomain } from './pollDomains/kills';

function killmail(overrides: Partial<PilotKillmail>): PilotKillmail {
  return {
    killmailId: 1,
    hash: 'h',
    side: 'loss',
    value: 12_400_000,
    detail: {
      time: '2026-10-01T12:00:00Z',
      systemId: 30002782,
      victim: { ship_type_id: 587, items: [] },
    } as unknown as PilotKillmail['detail'],
    ...overrides,
  };
}

describe('killsDomain.load', () => {
  beforeEach(() => fetchPilotKillmailHistory.mockReset());

  it('keeps only losses, with the ship, system, value and current minimum', async () => {
    fetchPilotKillmailHistory.mockResolvedValue({
      ok: true,
      reachesBackTo: null,
      entries: [killmail({ killmailId: 2, side: 'kill' }), killmail({ killmailId: 3 })],
    });
    expect(await killsDomain.load(7)).toEqual([
      {
        killmailId: 3,
        timeMs: Date.parse('2026-10-01T12:00:00Z'),
        shipTypeId: 587,
        systemId: 30002782,
        value: 12_400_000,
        thresholdIsk: 5_000_000,
      },
    ]);
  });

  it('skips the poll when zKillboard cannot be read, so no empty baseline is written', async () => {
    fetchPilotKillmailHistory.mockResolvedValue({ ok: false, reason: 'offline' });
    expect(await killsDomain.load(7)).toBeNull();
  });
});
