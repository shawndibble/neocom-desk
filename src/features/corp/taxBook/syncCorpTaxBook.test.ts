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

/** An issued, unpaid Statement: its Miner has an open balance, so a code-less donation credits (#6207). */
const owing = (minerId: string) =>
  ({
    id: `s-${minerId}`,
    minerId,
    code: `MT-${minerId}`,
    issuedAt: '2026-07-01T00:00:00Z',
    lines: [],
    amount: 10_000_000,
  }) as unknown as Statement;

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

  it('still syncs donations, and says so, when the corporation has no readable refineries', async () => {
    const d = deps({ loadObserverFeed: async () => 'no-refineries' });
    const outcome = await run(d);
    expect(outcome).toMatchObject({ kind: 'synced', observedRows: 0, noRefineries: true });
    expect(d.uploadSync).toHaveBeenCalled();
  });

  it('uploads the ledger, extractions and donations in one call, with the gaps', async () => {
    const d = deps({
      readBookState: async () => emptyState({ statements: [owing('solo:7')] }),
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
    // Known from the ledger, and its Miner owes, so the donation is credited to that Miner.
    expect(upload.donations?.[0]).toMatchObject({ refId: 9, minerId: 'solo:7' });
    expect(out).toMatchObject({
      kind: 'synced',
      observedRows: 1,
      extractions: 1,
      donationsAdded: 1,
    });
  });

  it('credits a known miner’s donation toward ore not yet on a Statement (#6207)', async () => {
    // Character 7 mined on 2026-07-19 and has no Statement: miners often pay the day they mine.
    const d = deps({
      loadDonations: async () => [
        { refId: 9, division: 1, characterId: 7, amount: 5, at: '2026-07-19T00:00:00.000Z' },
      ],
    });
    await run(d);
    const [donation] = vi.mocked(d.uploadSync).mock.calls[0][1].donations ?? [];
    expect(donation).toMatchObject({ minerId: 'solo:7' });
  });

  it('credits a known miner’s donation even when their Miner owes nothing (#6300)', async () => {
    // Billed through the day they mined, and paid in full: nothing owed, no ore unbilled.
    const billed = { ...owing('solo:7'), coversThrough: '2026-07-31' } as unknown as Statement;
    const d = deps({
      readBookState: async () =>
        emptyState({
          statements: [billed],
          payments: [
            {
              id: 'j1_1',
              minerId: 'solo:7',
              characterId: 7,
              amount: 10_000_000,
              at: '2026-07-02T00:00:00Z',
              source: 'donation',
            },
          ],
        }),
      loadDonations: async () => [
        { refId: 9, division: 1, characterId: 7, amount: 5, at: '2026-07-19T00:00:00.000Z' },
      ],
    });
    await run(d);
    const [donation] = vi.mocked(d.uploadSync).mock.calls[0][1].donations ?? [];
    expect(donation.minerId).toBe('solo:7');
    expect(donation.reviewReason).toBeUndefined();
  });

  it('notes tax paid into a division the book does not read, and never credits it (#6207)', async () => {
    const d = deps({
      readBookState: async () => emptyState({ statements: [owing('solo:7')] }),
      loadDonations: vi.fn(async (_c: number, _corp: number, divisions: readonly number[]) =>
        divisions.includes(1)
          ? []
          : [{ refId: 4, division: 2, characterId: 7, amount: 5, at: '2026-07-19T00:00:00.000Z' }]
      ),
    });
    await run(d);
    const upload = vi.mocked(d.uploadSync).mock.calls[0][1];
    expect(upload.donations).toEqual([]);
    expect(upload.uncounted).toEqual([
      {
        id: 'j2_4',
        refId: 4,
        division: 2,
        characterId: 7,
        amount: 5,
        at: '2026-07-19T00:00:00.000Z',
      },
    ]);
    expect(vi.mocked(d.loadDonations).mock.calls.map((c) => c[2])).toContainEqual([
      2, 3, 4, 5, 6, 7,
    ]);
  });

  it('leaves the noted list alone when the other divisions could not all be read', async () => {
    const d = deps({
      loadDonations: async (_c, _corp, divisions) => (divisions.includes(1) ? [] : null),
    });
    await run(d);
    expect('uncounted' in vi.mocked(d.uploadSync).mock.calls[0][1]).toBe(false);
  });

  it('assigns a donation held under #6207 to its Miner even though they owed nothing as they paid (#6300)', async () => {
    const d = deps({
      readBookState: async () =>
        emptyState({
          miners: [{ id: 'm1', mainCharacterId: 7, characterIds: [7, 8] }] as BookState['miners'],
          // Billed through the day mined before the donation: nothing was unbilled when they paid.
          statements: [{ ...owing('m1'), coversThrough: '2026-07-19' } as unknown as Statement],
          payments: [
            {
              id: 'j1_1',
              characterId: 8,
              amount: 5,
              at: '2026-07-19T00:00:00Z',
              source: 'donation',
              reviewReason: 'no-open-balance',
            },
          ],
        }),
    });
    await run(d);
    expect(d.assignPayment).toHaveBeenCalledWith(5, CORP, 'j1_1', 'm1');
  });

  it('matches a held donation once the lagging ledger shows ore its Miner had not been billed for when paying', async () => {
    const d = deps({
      readBookState: async () =>
        emptyState({
          miners: [{ id: 'm1', mainCharacterId: 7, characterIds: [7, 8] }] as BookState['miners'],
          statements: [owing('m1')],
          payments: [
            {
              id: 'j1_1',
              characterId: 8,
              amount: 5,
              at: '2026-07-19T00:00:00Z',
              source: 'donation',
              reviewReason: 'no-open-balance',
            },
          ],
        }),
    });
    await run(d);
    // Character 7 mined on the day character 8 paid; the ledger only showed it on this sync.
    expect(d.assignPayment).toHaveBeenCalledWith(5, CORP, 'j1_1', 'm1');
  });

  describe('moon owner mining the book bills (stored rows, not this read)', () => {
    // A book that bills from 2026-07-01 and whose only refinery read holds nothing for character
    // 7: their ore was all mined at a moon owner's refinery, stored tagged with that owner.
    const FEEDER = 98000002;
    const fed = (date: string, characterId = 7) => ({
      ...row(characterId, date),
      sourceCorporationId: FEEDER,
    });
    const held = (id: string, at: string) => ({
      id,
      characterId: 7,
      amount: 26_952_549,
      at,
      source: 'donation' as const,
      division: 5,
      reviewReason: 'no-open-balance' as const,
    });
    const onlyFed = (over: Partial<SyncDeps> = {}) =>
      deps({
        loadObserverFeed: async () => ({
          rows: [row(9)],
          structureIds: [1001],
          oldestEsiDate: { 1001: '2026-07-19' },
          truncated: false,
          systemIds: {},
        }),
        loadStoredRows: vi.fn(async () => ({
          rows: [fed('2026-07-01'), fed('2026-07-02'), fed('2026-07-11')],
          feeders: [{ corporationId: FEEDER, coveragePeriods: [{ from: '2026-07-01' }] }],
        })),
        ...over,
      });
    const book = (payments: BookState['payments']) =>
      emptyState({
        book: { ...emptyState().book, startDate: '2026-07-01' },
        payments,
      });

    it('releases a held donation paid after moon owner mining no Statement covered', async () => {
      const d = onlyFed({
        readBookState: async () =>
          book([
            held('j5_1', '2026-07-02T22:38:44.000Z'),
            held('j5_2', '2026-07-14T18:28:44.000Z'),
            // Paid before the book bills from: still credited to the Miner, the book ignores it.
            held('j5_0', '2026-06-21T17:38:23.000Z'),
          ]),
      });
      await run(d);
      expect(
        vi
          .mocked(d.assignPayment)
          .mock.calls.map((c) => c[2])
          .sort()
      ).toEqual(['j5_0', 'j5_1', 'j5_2']);
      expect(d.assignPayment).toHaveBeenCalledWith(5, CORP, 'j5_1', 'solo:7');
    });

    it('keeps a held donation when the moon owner did not cover the day it was mined', async () => {
      const d = onlyFed({
        readBookState: async () => book([held('j5_1', '2026-07-02T22:38:44.000Z')]),
        loadStoredRows: async () => ({
          rows: [fed('2026-07-01'), fed('2026-07-02')],
          feeders: [{ corporationId: FEEDER, coveragePeriods: [{ from: '2026-07-10' }] }],
        }),
      });
      await run(d);
      expect(d.assignPayment).not.toHaveBeenCalled();
    });

    it('credits a new donation to its Miner when their only unbilled ore is moon owner mining', async () => {
      const d = onlyFed({
        readBookState: async () =>
          book([
            {
              id: 'j1_0',
              characterId: 7,
              minerId: 'solo:7',
              amount: 1,
              at: '2026-07-01T00:00:00Z',
              source: 'donation',
            },
          ]),
        loadDonations: async () => [
          { refId: 9, division: 5, characterId: 7, amount: 5, at: '2026-07-14T18:28:44.000Z' },
        ],
      });
      await run(d);
      const [donation] = vi.mocked(d.uploadSync).mock.calls[0][1].donations ?? [];
      expect(donation).toMatchObject({ minerId: 'solo:7' });
    });

    it('reads no stored rows when nothing is held and nothing new came in', async () => {
      const d = onlyFed();
      await run(d);
      expect(d.loadStoredRows).not.toHaveBeenCalled();
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
          statements: [owing('m1')],
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
          statements: [owing('m1')],
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

  it('hands the wallet to moon owner payouts once it read, and a refusal never fails the sync', async () => {
    const reconcilePayouts = vi.fn(async () => {
      throw new Error('refused');
    });
    expect(await run(deps({ reconcilePayouts }))).toMatchObject({ kind: 'synced' });
    expect(reconcilePayouts).toHaveBeenCalledWith(5, CORP, [1]);
  });

  it('leaves payouts alone when the wallet could not be read', async () => {
    const reconcilePayouts = vi.fn(async () => ({}));
    await run(deps({ reconcilePayouts }), { ...all, canReadWallet: false });
    expect(reconcilePayouts).not.toHaveBeenCalled();
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
    // So members' "not credited" notes do not count this sync as one the donation missed.
    expect(vi.mocked(d.uploadSync).mock.calls[0][1].donationsRead).toBe(false);
  });

  it('tells the book whether it read the wallet: yes when it did, no when the read failed', async () => {
    const ok = deps();
    await run(ok);
    expect(vi.mocked(ok.uploadSync).mock.calls[0][1].donationsRead).toBe(true);
    const failed = deps({
      loadDonations: vi.fn(async () => {
        throw new Error('down');
      }),
    });
    await run(failed);
    expect(vi.mocked(failed.uploadSync).mock.calls[0][1].donationsRead).toBe(false);
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

  it('merges two stored Miners of the account by regroup and counts the characters', async () => {
    const d = deps({
      readBookState: vi.fn(async () =>
        emptyState({
          miners: [
            { id: 'a', mainCharacterId: 5, characterIds: [5, 1] },
            { id: 'b', mainCharacterId: 6, characterIds: [6, 2] },
          ] as BookState['miners'],
        })
      ),
      loadAccountCharacters: async () => [
        { characterId: 5, corporationId: CORP },
        { characterId: 6, corporationId: CORP },
      ],
    });
    const out = await run(d);
    expect(d.applyGrouping).toHaveBeenCalledWith(
      5,
      CORP,
      expect.objectContaining({ action: 'regroupMiner', absorbMinerIds: ['b'] })
    );
    expect(out).toMatchObject({ autoGrouped: 4 });
  });

  it('surfaces a merge prompt for a character two groups claim, and applies nothing for it', async () => {
    const d = deps({
      readBookState: vi.fn(async () =>
        emptyState({
          miners: [
            { id: 'a', mainCharacterId: 1, characterIds: [1, 6] },
            { id: 'b', mainCharacterId: 2, characterIds: [2, 6] },
          ] as BookState['miners'],
        })
      ),
      loadAccountCharacters: async () => [
        { characterId: 5, corporationId: CORP },
        { characterId: 6, corporationId: CORP },
      ],
    });
    const out = await run(d);
    expect(d.applyGrouping).not.toHaveBeenCalled();
    expect(out).toMatchObject({
      groupPrompts: [{ reason: 'conflict', characterIds: [6], minerIds: ['a', 'b'] }],
    });
  });

  it('reports a declined character as flagged, never added', async () => {
    const d = deps({
      loadAccountCharacters: async () => [
        { characterId: 5, corporationId: CORP },
        { characterId: 8, corporationId: CORP },
      ],
      declinedGrouping: vi.fn(async () => new Set([8])),
    });
    const out = await run(d);
    expect(d.applyGrouping).not.toHaveBeenCalled();
    expect(out).toMatchObject({ groupFlagged: [8] });
  });
});
