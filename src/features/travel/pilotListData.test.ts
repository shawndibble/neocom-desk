import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  postUniverseIds: vi.fn(),
  resolveAffiliations: vi.fn(),
  resolveNames: vi.fn(),
  fetchPilotKillHistory: vi.fn(),
  fetchPilotStats: vi.fn(),
  loadContacts: vi.fn(),
}));
vi.mock('@/esi/endpoints', () => ({ postUniverseIds: mocks.postUniverseIds }));
vi.mock('@/features/character/affiliations', () => ({
  resolveAffiliations: mocks.resolveAffiliations,
}));
vi.mock('@/features/character/names', () => ({ resolveNames: mocks.resolveNames }));
vi.mock('@/features/character/contacts', () => ({ loadContacts: mocks.loadContacts }));
vi.mock('@/lib/zkillboard', () => ({
  fetchPilotKillHistory: mocks.fetchPilotKillHistory,
  fetchPilotStats: mocks.fetchPilotStats,
}));

import { rowThreat } from './rowThreat';
import { summarizeKills } from '@/engine/pilotList/killActivity';
import {
  loadPilotList,
  loadViewerContext,
  type PilotListRow,
  type ViewerContext,
} from './pilotListData';

const HOUR = 3_600_000;
const kill = (agoMs: number) => ({
  timeMs: Date.now() - agoMs,
  space: 'nullsec' as const,
  systemId: 1,
  victimShipTypeId: 2,
  ownShipTypeId: 3,
});

describe('loadPilotList', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.postUniverseIds.mockResolvedValue({
      characters: [
        { id: 1, name: 'Alpha' },
        { id: 2, name: 'Beta' },
        { id: 3, name: 'Gamma' },
        { id: 4, name: 'Delta' },
      ],
    });
    mocks.resolveAffiliations.mockResolvedValue(
      new Map([
        [1, { character_id: 1, corporation_id: 10, alliance_id: 20 }],
        [2, { character_id: 2, corporation_id: 11 }],
        [3, { character_id: 3, corporation_id: 99 }],
        [4, { character_id: 4, corporation_id: 12 }],
      ])
    );
    mocks.resolveNames.mockResolvedValue(
      new Map([
        [10, 'Corp'],
        [20, 'Alliance'],
      ])
    );
    mocks.fetchPilotKillHistory.mockImplementation((id: number) =>
      Promise.resolve(id === 2 ? { ok: false } : { ok: true, kills: [kill(2 * HOUR)] })
    );
  });

  const viewer: ViewerContext = {
    contacts: new Map([
      [11, -5],
      [12, 5],
    ]),
    corporationId: 99,
    allianceId: null,
  };

  async function run(names: string[], context: ViewerContext = viewer) {
    let last: PilotListRow[] = [];
    await loadPilotList(names, {
      onRows: (rows) => (last = rows),
      viewer: Promise.resolve(context),
    });
    return last;
  }

  it('marks an unresolved name as not found, and a zKillboard failure as unreachable', async () => {
    const rows = await run(['alpha', 'Beta', 'Nobody']);
    expect(mocks.postUniverseIds).toHaveBeenCalledTimes(1);
    expect(rows.map((r) => [r.name, r.notFound, r.kills.kind])).toEqual([
      ['alpha', false, 'ready'],
      ['Beta', false, 'unreachable'],
      ['Nobody', true, 'skipped'],
    ]);
    expect(rows[0]).toMatchObject({ corporationName: 'Corp', allianceName: 'Alliance' });
  });

  it('reads contact standing and skips the kill list of friendly pilots', async () => {
    const rows = await run(['Beta', 'Gamma', 'Delta']);
    const [beta, gamma, delta] = rows;
    expect(beta.standing).toEqual({ band: 'orange', value: -5, via: 'corporation' });
    // Gamma is in the viewer's own corporation; Delta is a blue contact.
    expect(gamma.ownOrganization).toBe('corporation');
    expect(gamma.kills.kind).toBe('skipped');
    expect(delta.standing?.band).toBe('blue');
    expect(delta.kills.kind).toBe('skipped');
    expect(mocks.fetchPilotKillHistory).toHaveBeenCalledTimes(1);
    expect(mocks.fetchPilotKillHistory).toHaveBeenCalledWith(2);
  });

  describe('Threat verdict', () => {
    const DAY = 24 * HOUR;
    const busy = Array.from({ length: 12 }, (_, i) => kill((i + 1) * DAY));

    it('looks up stats only for a pilot with enough recent kills to be dangerous', async () => {
      mocks.fetchPilotKillHistory.mockImplementation((id: number) =>
        Promise.resolve({ ok: true, kills: id === 1 ? busy : [kill(DAY), kill(2 * DAY)] })
      );
      mocks.fetchPilotStats.mockResolvedValue({
        kind: 'stats',
        stats: { dangerRatio: 60 },
      });
      const [alpha, beta] = await run(['Alpha', 'Beta'], { ...viewer, contacts: new Map() });
      expect(mocks.fetchPilotStats).toHaveBeenCalledTimes(1);
      expect(mocks.fetchPilotStats).toHaveBeenCalledWith(1);
      expect(rowThreat(alpha, Date.now())).toBe('dangerous');
      expect(rowThreat(beta, Date.now())).toBe('low');
    });

    it('falls back to active when the stats could not be read', async () => {
      mocks.fetchPilotKillHistory.mockResolvedValue({ ok: true, kills: busy });
      mocks.fetchPilotStats.mockResolvedValue({ kind: 'failed' });
      const [alpha] = await run(['Alpha'], { ...viewer, contacts: new Map() });
      expect(rowThreat(alpha, Date.now())).toBe('active');
    });

    it('has no verdict for a row whose kills are not loaded, and is pending on the ratio', () => {
      const base = {
        name: 'X',
        characterId: 1,
        notFound: false,
        corporationId: null,
        allianceId: null,
        corporationName: null,
        allianceName: null,
        standing: null,
        ownOrganization: null,
      } satisfies Partial<PilotListRow>;
      expect(
        rowThreat({ ...base, kills: { kind: 'loading' }, danger: { kind: 'idle' } }, Date.now())
      ).toBeNull();
      expect(
        rowThreat({ ...base, kills: { kind: 'skipped' }, danger: { kind: 'idle' } }, Date.now())
      ).toBeNull();
      expect(
        rowThreat(
          {
            ...base,
            kills: { kind: 'ready', kills: busy, summary: summarizeKills(busy, Date.now()) },
            danger: { kind: 'loading' },
          },
          Date.now()
        )
      ).toBe('pending');
    });
  });

  it('summarises a ready pilot over the last 30 days', async () => {
    const [alpha] = await run(['Alpha']);
    expect(alpha.kills).toMatchObject({ kind: 'ready', summary: { recentCount: 1 } });
  });

  it('still lists pilots when affiliations fail', async () => {
    mocks.resolveAffiliations.mockRejectedValue(new Error('down'));
    const [alpha] = await run(['Alpha']);
    expect(alpha).toMatchObject({ corporationId: null, standing: null, kills: { kind: 'ready' } });
  });
});

describe('loadViewerContext', () => {
  beforeEach(() => vi.resetAllMocks());

  it('maps contacts and reads the viewer corporation and alliance', async () => {
    mocks.loadContacts.mockResolvedValue({
      cached: { data: [{ contact_id: 5, contact_type: 'corporation', standing: -10 }] },
    });
    mocks.resolveAffiliations.mockResolvedValue(
      new Map([[7, { character_id: 7, corporation_id: 70, alliance_id: 71 }]])
    );
    expect(await loadViewerContext(7)).toEqual({
      contacts: new Map([[5, -10]]),
      corporationId: 70,
      allianceId: 71,
    });
  });

  it('is empty without a Character, and when both requests fail', async () => {
    expect((await loadViewerContext(null)).contacts.size).toBe(0);
    mocks.loadContacts.mockRejectedValue(new Error('no scope'));
    mocks.resolveAffiliations.mockRejectedValue(new Error('down'));
    expect(await loadViewerContext(7)).toEqual({
      contacts: new Map(),
      corporationId: null,
      allianceId: null,
    });
  });
});
