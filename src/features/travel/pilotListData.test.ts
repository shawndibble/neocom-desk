import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  postUniverseIds: vi.fn(),
  resolveAffiliations: vi.fn(),
  resolveNames: vi.fn(),
  fetchPilotKillHistory: vi.fn(),
  fetchPilotStats: vi.fn(),
  fetchPilotKillmails: vi.fn(),
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
  fetchPilotKillmails: mocks.fetchPilotKillmails,
}));

import { db } from '@/db';
import { rowThreat } from './rowThreat';
import { storeCharacterIds, storeKillHistory } from './pilotHistoryStore';
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
  beforeEach(async () => {
    await db.esiCache.clear();
    await db.esiCacheMeta.clear();
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

  describe('what an earlier paste left behind (issue #5812)', () => {
    const MIN = 60_000;
    const stored = (agoMs: number) => Date.now() - agoMs;

    it('pastes the same Local again without asking zKillboard or ESI for names', async () => {
      await run(['Alpha']);
      expect(mocks.fetchPilotKillHistory).toHaveBeenCalledTimes(1);
      vi.clearAllMocks();
      const rows = await run(['Alpha']);
      expect(mocks.fetchPilotKillHistory).not.toHaveBeenCalled();
      expect(mocks.postUniverseIds).not.toHaveBeenCalled();
      expect(rows[0].kills).toMatchObject({ kind: 'ready' });
      expect((rows[0].kills as { staleSinceMs?: number }).staleSinceMs).toBeUndefined();
    });

    it('fetches only the pilot it has not seen, and only asks ESI for that name', async () => {
      mocks.postUniverseIds.mockResolvedValue({ characters: [{ id: 1, name: 'Alpha' }] });
      await run(['Alpha']);
      vi.clearAllMocks();
      mocks.postUniverseIds.mockResolvedValue({ characters: [{ id: 2, name: 'Beta' }] });
      mocks.fetchPilotKillHistory.mockResolvedValue({ ok: true, kills: [] });
      mocks.fetchPilotKillmails.mockResolvedValue({ ok: true, entries: [] });
      await run(['Alpha', 'Beta']);
      expect(mocks.postUniverseIds).toHaveBeenCalledWith(['Beta'], expect.objectContaining({}));
      expect(mocks.fetchPilotKillHistory.mock.calls.map(([id]) => id)).toEqual([2]);
    });

    it('shows a copy over 30 minutes old at once, marked stale, then replaces it', async () => {
      const at = stored(2 * HOUR);
      await storeKillHistory(1, [kill(5 * HOUR)], at);
      await storeCharacterIds([{ id: 1, name: 'Alpha' }], Date.now());
      const seen: PilotListRow[][] = [];
      mocks.fetchPilotKillHistory.mockResolvedValue({ ok: true, kills: [kill(HOUR)] });
      await loadPilotList(['Alpha'], {
        onRows: (rows) => seen.push(rows),
        viewer: Promise.resolve(viewer),
      });
      const staleFrames = seen.filter(
        (rows) => rows[0].kills.kind === 'ready' && rows[0].kills.staleSinceMs === at
      );
      expect(staleFrames.length).toBeGreaterThan(0);
      const last = seen[seen.length - 1][0].kills;
      expect(last.kind === 'ready' && last.staleSinceMs).toBeUndefined();
      expect(last.kind === 'ready' && last.kills).toEqual([expect.objectContaining({})]);
      expect(mocks.fetchPilotKillHistory).toHaveBeenCalledTimes(1);
    });

    it('keeps the stale copy, never "unreachable", when the refresh fails', async () => {
      const at = stored(2 * HOUR);
      await storeKillHistory(1, [kill(5 * HOUR)], at);
      await storeCharacterIds([{ id: 1, name: 'Alpha' }], Date.now());
      mocks.fetchPilotKillHistory.mockResolvedValue({ ok: false, reason: 'rate-limited' });
      const rows = await run(['Alpha']);
      expect(rows[0].kills).toMatchObject({ kind: 'ready', staleSinceMs: at });
    });

    it('does not show a copy older than a day: the pilot loads again', async () => {
      await storeKillHistory(1, [kill(5 * HOUR)], stored(25 * HOUR));
      await storeCharacterIds([{ id: 1, name: 'Alpha' }], Date.now());
      mocks.fetchPilotKillHistory.mockResolvedValue({ ok: false, reason: 'offline' });
      const rows = await run(['Alpha']);
      expect(mocks.fetchPilotKillHistory).toHaveBeenCalledTimes(1);
      expect(rows[0].kills.kind).toBe('unreachable');
    });

    it('treats 29 minutes as fresh and 31 as stale', async () => {
      await storeCharacterIds(
        [
          { id: 1, name: 'Alpha' },
          { id: 2, name: 'Beta' },
        ],
        Date.now()
      );
      await storeKillHistory(1, [], stored(29 * MIN));
      await storeKillHistory(2, [], stored(31 * MIN));
      mocks.fetchPilotKillHistory.mockResolvedValue({ ok: true, kills: [] });
      mocks.fetchPilotKillmails.mockResolvedValue({ ok: true, entries: [] });
      await run(['Alpha', 'Beta']);
      expect(mocks.fetchPilotKillHistory.mock.calls.map(([id]) => id)).toEqual([2]);
    });
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

  it('asks zKillboard about unknown and neutral pilots before red and orange contacts', async () => {
    // Alpha is red and Beta orange (both already known to be bad); Delta has no
    // standing. Pasted order is bad news first, but the unknown is worth waiting on.
    const contacts = new Map([
      [1, -10],
      [11, -5],
    ]);
    await run(['Alpha', 'Beta', 'Delta'], { ...viewer, contacts });
    expect(mocks.fetchPilotKillHistory.mock.calls.map(([id]) => id)).toEqual([4, 1, 2]);
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
        stats: { dangerRatio: 60, kills: 10, losses: 10 },
      });
      const [alpha, beta] = await run(['Alpha', 'Beta'], { ...viewer, contacts: new Map() });
      expect(mocks.fetchPilotStats).toHaveBeenCalledTimes(1);
      expect(mocks.fetchPilotStats).toHaveBeenCalledWith(1);
      expect(rowThreat(alpha, Date.now())).toBe('dangerous');
      expect(rowThreat(beta, Date.now())).toBe('low');
    });

    it('counts a high share of kills as dangerous even when the danger ratio is low', async () => {
      mocks.fetchPilotKillHistory.mockResolvedValue({ ok: true, kills: busy });
      mocks.fetchPilotStats.mockResolvedValue({
        kind: 'stats',
        stats: { dangerRatio: 42, kills: 610, losses: 304 },
      });
      const [alpha] = await run(['Alpha'], { ...viewer, contacts: new Map() });
      expect(rowThreat(alpha, Date.now())).toBe('dangerous');
    });

    it('reads the losses of a pilot with no recent kill, and not of anyone else', async () => {
      mocks.fetchPilotKillHistory.mockImplementation((id: number) =>
        Promise.resolve({ ok: true, kills: id === 1 ? [kill(100 * DAY)] : [kill(2 * DAY)] })
      );
      mocks.fetchPilotKillmails.mockResolvedValue({
        ok: true,
        entries: [
          {
            killmailId: 9,
            hash: 'h',
            side: 'loss',
            value: null,
            detail: { time: new Date(Date.now() - 3 * DAY).toISOString() },
          },
        ],
      });
      const [alpha, beta] = await run(['Alpha', 'Beta'], { ...viewer, contacts: new Map() });
      expect(mocks.fetchPilotKillmails).toHaveBeenCalledTimes(1);
      expect(mocks.fetchPilotKillmails).toHaveBeenCalledWith(1);
      expect(mocks.fetchPilotStats).not.toHaveBeenCalled();
      expect(rowThreat(alpha, Date.now())).toBe('low');
      expect(rowThreat(beta, Date.now())).toBe('low');
    });

    it('is inactive when a pilot with no recent kill has no recent loss either', async () => {
      mocks.fetchPilotKillHistory.mockResolvedValue({ ok: true, kills: [kill(100 * DAY)] });
      mocks.fetchPilotKillmails.mockResolvedValue({ ok: true, entries: [] });
      const [alpha] = await run(['Alpha'], { ...viewer, contacts: new Map() });
      expect(rowThreat(alpha, Date.now())).toBe('inactive');
    });

    it('gives no verdict when the losses of a pilot with no recent kill could not be read or dated', async () => {
      mocks.fetchPilotKillHistory.mockResolvedValue({ ok: true, kills: [kill(100 * DAY)] });
      mocks.fetchPilotKillmails.mockResolvedValueOnce({ ok: false });
      mocks.fetchPilotKillmails.mockResolvedValueOnce({
        ok: true,
        entries: [{ killmailId: 5, hash: 'h', side: 'loss', value: null, detail: null }],
      });
      const [alpha, beta] = await run(['Alpha', 'Beta'], { ...viewer, contacts: new Map() });
      expect(rowThreat(alpha, Date.now())).toBeNull();
      expect(rowThreat(beta, Date.now())).toBeNull();
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
        rowThreat({ ...base, kills: { kind: 'loading' }, extras: { kind: 'idle' } }, Date.now())
      ).toBeNull();
      expect(
        rowThreat({ ...base, kills: { kind: 'skipped' }, extras: { kind: 'idle' } }, Date.now())
      ).toBeNull();
      expect(
        rowThreat(
          {
            ...base,
            kills: { kind: 'ready', kills: busy, summary: summarizeKills(busy, Date.now()) },
            extras: { kind: 'loading' },
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

  it('looks up kills for the first 40 names only, and places every name by organization', async () => {
    const names = Array.from({ length: 45 }, (_, i) => `Pilot ${i}`);
    mocks.postUniverseIds.mockResolvedValue({
      characters: names.map((name, i) => ({ id: 1000 + i, name })),
    });
    mocks.resolveAffiliations.mockImplementation((ids: number[]) =>
      Promise.resolve(
        new Map(ids.map((id) => [id, { character_id: id, corporation_id: 50, alliance_id: 60 }]))
      )
    );

    const rows = await run(names);

    expect(mocks.fetchPilotKillHistory).toHaveBeenCalledTimes(40);
    expect(mocks.fetchPilotKillHistory).not.toHaveBeenCalledWith(1040);
    expect(rows.slice(0, 40).every((row) => row.kills.kind === 'ready')).toBe(true);
    expect(rows.slice(40).map((row) => row.kills.kind)).toEqual(Array(5).fill('notLookedUp'));
    expect(rows.every((row) => row.corporationId === 50 && row.allianceId === 60)).toBe(true);
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
