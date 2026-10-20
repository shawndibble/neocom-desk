import { describe, expect, it, vi } from 'vitest';
import type { Statement } from '@/engine/corpTaxBook/statements';
import {
  OBSERVED_PER_CALL,
  syncCorpTaxBook,
  type SyncCapabilities,
  type SyncDeps,
} from './syncCorpTaxBook';
import type { BookState, OfficerVerdict } from './bookClient';

const NOW = Date.parse('2026-07-20T12:00:00Z');
const CORP = 98000001;

const verdict = (over: Partial<OfficerVerdict> = {}): OfficerVerdict => ({
  corporationId: CORP,
  isCeo: false,
  isDirector: true,
  isStationManager: true,
  canView: true,
  canEdit: true,
  bookActive: true,
  expiresAt: NOW + 1,
  ...over,
});

const emptyState = (over: Partial<BookState> = {}): BookState => ({
  book: {
    active: true,
    startDate: '2026-01-01',
    divisions: [1],
    lastSync: null,
    structureExpiryHours: {},
  },
  miners: [],
  statements: [],
  payments: [],
  dismissals: [],
  extractions: [],
  paidStatementIds: new Set(),
  ...over,
});

const row = (characterId: number, date = '2026-07-19') => ({
  structureId: 1001,
  characterId,
  recordedCorporationId: CORP,
  typeId: 45490,
  date,
  quantity: 10,
  cachedAt: '2026-07-20T11:00:00.000Z',
});

function deps(over: Partial<SyncDeps> = {}) {
  const d: SyncDeps = {
    now: () => NOW,
    verifyOfficer: vi.fn(async () => verdict()),
    readBookState: vi.fn(async () => emptyState()),
    loadObserverFeed: vi.fn(async () => ({
      rows: [row(7)],
      structureIds: [1001],
      oldestEsiDate: { 1001: '2026-07-19' },
      truncated: false,
      systemIds: { 1001: 30000142 },
    })),
    loadEsiExtractions: vi.fn(async () => []),
    loadMoonNotifications: vi.fn(async () => []),
    loadDonations: vi.fn(async () => []),
    uploadSync: vi.fn(async (_c, u) => ({
      observedChanged: u.observed?.length ?? 0,
      extractions: u.extractions?.length ?? 0,
      donationsAdded: u.donations?.length ?? 0,
    })),
    settleStatements: vi.fn(async () => ({})),
    loadAccountCharacters: vi.fn(async () => []),
    declinedGrouping: vi.fn(async () => new Set<number>()),
    applyGrouping: vi.fn(async () => ({})),
    assignPayment: vi.fn(async () => ({})),
    ...over,
  };
  return d;
}

const all: SyncCapabilities = {
  canReadMiningLedger: true,
  canReadMoonExtractions: true,
  canReadWallet: true,
};
const run = (d: SyncDeps, capabilities = all) =>
  syncCorpTaxBook({ characterId: 5, corporationId: CORP, capabilities }, d);

describe('syncCorpTaxBook', () => {
  it('asks for the mining scope before touching anything', async () => {
    const d = deps();
    const out = await run(d, { ...all, canReadMiningLedger: false });
    expect(out).toEqual({ kind: 'skipped', reason: 'missing-mining-scope' });
    expect(d.verifyOfficer).not.toHaveBeenCalled();
  });

  it('stops for a corporation with no book and for an officer who cannot edit', async () => {
    expect(await run(deps({ verifyOfficer: async () => verdict({ bookActive: false }) }))).toEqual({
      kind: 'skipped',
      reason: 'no-book',
    });
    const d = deps({ verifyOfficer: async () => verdict({ canEdit: false }) });
    expect(await run(d)).toEqual({ kind: 'skipped', reason: 'not-an-editor' });
    expect(d.uploadSync).not.toHaveBeenCalled();
  });

  it('records nothing when the ledger could not be read', async () => {
    const d = deps({ loadObserverFeed: async () => 'unavailable' });
    expect(await run(d)).toEqual({ kind: 'skipped', reason: 'esi-unavailable' });
    expect(d.uploadSync).not.toHaveBeenCalled();
    expect(await run(deps({ loadObserverFeed: async () => 'needs-reauth' }))).toEqual({
      kind: 'skipped',
      reason: 'needs-reauth',
    });
  });

  it('says so, and records nothing, when the corporation has no readable refineries', async () => {
    const d = deps({ loadObserverFeed: async () => 'no-refineries' });
    expect(await run(d)).toEqual({ kind: 'skipped', reason: 'no-refineries' });
    expect(d.uploadSync).not.toHaveBeenCalled();
  });

  it('uploads the ledger, extractions and donations in one call, with the gaps', async () => {
    const d = deps({
      loadEsiExtractions: async () => [
        {
          structure_id: 1001,
          moon_id: 40,
          extraction_start_time: '2026-07-15T00:00:00Z',
          chunk_arrival_time: '2026-07-25T00:00:00Z',
          natural_decay_time: '2026-07-25T03:00:00Z',
        },
      ],
      loadDonations: async () => [
        { refId: 9, division: 1, characterId: 7, amount: 5, at: '2026-07-19T00:00:00.000Z' },
      ],
    });
    const out = await run(d);
    expect(d.uploadSync).toHaveBeenCalledTimes(1);
    const upload = vi.mocked(d.uploadSync).mock.calls[0][1];
    expect(upload.observed).toHaveLength(1);
    expect(upload.extractions).toHaveLength(1);
    // Known from the ledger, so the donation is credited to that Miner.
    expect(upload.donations?.[0]).toMatchObject({ refId: 9, minerId: 'solo:7' });
    expect(out).toMatchObject({
      kind: 'synced',
      observedRows: 1,
      extractions: 1,
      donationsAdded: 1,
    });
  });

  it('does not resend donations the book already holds', async () => {
    const d = deps({
      readBookState: async () =>
        emptyState({
          payments: [
            {
              id: 'j1_9',
              characterId: 7,
              amount: 5,
              at: '2026-07-19T00:00:00Z',
              source: 'donation',
            },
          ],
        }),
      loadDonations: async () => [
        { refId: 9, division: 1, characterId: 7, amount: 5, at: '2026-07-19T00:00:00.000Z' },
      ],
    });
    await run(d);
    expect(vi.mocked(d.uploadSync).mock.calls[0][1].donations).toEqual([]);
  });

  it('assigns a stored Unmatched donation whose sender has joined a Miner since', async () => {
    const d = deps({
      readBookState: async () =>
        emptyState({
          miners: [{ id: 'm1', mainCharacterId: 7, characterIds: [7, 8] }] as BookState['miners'],
          payments: [
            {
              id: 'j1_1',
              characterId: 8,
              amount: 5,
              at: '2026-07-19T00:00:00Z',
              source: 'donation',
            },
            {
              id: 'j1_2',
              characterId: 99,
              amount: 5,
              at: '2026-07-19T00:00:00Z',
              source: 'donation',
            },
            {
              id: 'j1_3',
              minerId: 'm1',
              characterId: 8,
              amount: 5,
              at: '2026-07-19T00:00:00Z',
              source: 'donation',
            },
          ],
        }),
    });
    await run(d);
    expect(d.assignPayment).toHaveBeenCalledTimes(1);
    expect(d.assignPayment).toHaveBeenCalledWith(5, CORP, 'j1_1', 'm1');
  });

  it('does not fail the sync when re-matching an Unmatched donation is refused, and says so', async () => {
    const d = deps({
      readBookState: async () =>
        emptyState({
          miners: [{ id: 'm1', mainCharacterId: 7, characterIds: [7, 8] }] as BookState['miners'],
          payments: [
            {
              id: 'j1_1',
              characterId: 8,
              amount: 5,
              at: '2026-07-19T00:00:00Z',
              source: 'donation',
            },
          ],
        }),
      assignPayment: vi.fn(async () => {
        throw new Error('assign refused');
      }),
    });
    expect(await run(d)).toMatchObject({ kind: 'synced', reassignError: 'assign refused' });
  });

  it('reports lost history and keeps earlier gaps on record', async () => {
    const d = deps({
      readBookState: async () =>
        emptyState({
          book: {
            active: true,
            startDate: '2026-01-01',
            divisions: [1],
            structureExpiryHours: {},
            lastSync: {
              at: Date.parse('2026-06-01T12:00:00Z'),
              byCharacterId: 6,
              byName: 'Bo',
              gaps: [{ structureId: 1001, from: '2026-04-01', to: '2026-04-03' }],
            },
          },
        }),
    });
    const out = await run(d);
    expect(out).toMatchObject({
      gaps: [
        { structureId: 1001, from: '2026-04-01', to: '2026-04-03' },
        { structureId: 1001, from: '2026-06-01', to: '2026-06-20' },
      ],
    });
    expect(vi.mocked(d.uploadSync).mock.calls[0][1].gaps).toHaveLength(2);
  });

  it('syncs the ledger alone for an Accountant who cannot see extractions or the wallet', async () => {
    const d = deps();
    const out = await run(d, {
      canReadMiningLedger: true,
      canReadMoonExtractions: false,
      canReadWallet: false,
    });
    expect(d.loadEsiExtractions).not.toHaveBeenCalled();
    expect(d.loadDonations).not.toHaveBeenCalled();
    expect(out).toMatchObject({ kind: 'synced', missing: ['donations'] });
  });

  it('uploads each observed row with its refinery’s system', async () => {
    const d = deps();
    await run(d);
    expect(vi.mocked(d.uploadSync).mock.calls[0][1].observed?.[0]).toMatchObject({
      solarSystemId: 30000142,
    });
  });

  it('splits a big ledger across calls, leaving the visit’s record for the last', async () => {
    const rows = Array.from({ length: OBSERVED_PER_CALL + 5 }, (_, i) => row(1000 + i));
    const d = deps({
      loadObserverFeed: async () => ({
        rows,
        structureIds: [1001],
        oldestEsiDate: {},
        truncated: false,
        systemIds: {},
      }),
    });
    await run(d);
    const calls = vi.mocked(d.uploadSync).mock.calls.map((c) => c[1]);
    expect(calls).toHaveLength(2);
    expect(calls[0].observed).toHaveLength(OBSERVED_PER_CALL);
    expect(calls[1].observed).toHaveLength(5);
    expect(calls[0].extractions).toBeDefined();
    expect(calls[1].extractions).toBeUndefined();
  });

  it('settles the Statements the new donation pays, and only those', async () => {
    const statement = {
      id: 's1',
      minerId: 'solo:7',
      code: 'MT-1',
      issuedAt: '2026-07-01T00:00:00Z',
      lines: [],
      amount: 10_000_000,
    } as unknown as Statement;
    const stored = emptyState({ statements: [statement] });
    const paid = emptyState({
      statements: [statement],
      payments: [
        {
          id: 'j1_9',
          minerId: 'solo:7',
          characterId: 7,
          amount: 10_000_000,
          at: '2026-07-19T00:00:00Z',
          source: 'donation',
        },
      ],
    });
    const read = vi.fn().mockResolvedValueOnce(stored).mockResolvedValueOnce(paid);
    const d = deps({
      readBookState: read,
      loadDonations: async () => [
        {
          refId: 9,
          division: 1,
          characterId: 7,
          amount: 10_000_000,
          at: '2026-07-19T00:00:00.000Z',
        },
      ],
    });
    const out = await run(d);
    expect(d.settleStatements).toHaveBeenCalledWith(5, CORP, ['s1']);
    expect(out).toMatchObject({ settled: ['s1'] });
  });

  it('groups the account’s own Characters in the corporation (D26)', async () => {
    const d = deps({
      loadAccountCharacters: async () => [
        { characterId: 5, corporationId: CORP },
        { characterId: 6, corporationId: CORP },
        { characterId: 9, corporationId: 1 },
      ],
    });
    const out = await run(d);
    expect(d.applyGrouping).toHaveBeenCalledWith(5, CORP, {
      action: 'setMiner',
      minerId: 'solo:5',
      characterIds: [5, 6],
      mainCharacterId: 5,
    });
    expect(out).toMatchObject({ kind: 'synced', autoGrouped: 2 });
  });

  it('leaves out characters the book says an officer unlinked', async () => {
    const d = deps({
      loadAccountCharacters: async () => [
        { characterId: 5, corporationId: CORP },
        { characterId: 6, corporationId: CORP },
        { characterId: 8, corporationId: CORP },
      ],
      declinedGrouping: vi.fn(async () => new Set([8])),
    });
    const out = await run(d);
    expect(d.declinedGrouping).toHaveBeenCalledWith(5, CORP);
    expect(d.applyGrouping).toHaveBeenCalledWith(
      5,
      CORP,
      expect.objectContaining({ characterIds: [5, 6] })
    );
    expect(out).toMatchObject({ autoGrouped: 2 });
  });

  it('does not fail a sync that already uploaded when grouping is refused, and says so', async () => {
    const d = deps({
      loadAccountCharacters: async () => [
        { characterId: 5, corporationId: CORP },
        { characterId: 6, corporationId: CORP },
      ],
      applyGrouping: async () => {
        throw new Error('refused');
      },
    });
    expect(await run(d)).toMatchObject({
      kind: 'synced',
      autoGrouped: 0,
      autoGroupError: 'refused',
    });
  });
});
