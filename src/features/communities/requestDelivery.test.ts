import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommunityRequest, PledgeEntry, RequestPledge } from '@/engine/communities/requests';

const mocks = vi.hoisted(() => ({
  scopes: ['esi-contracts.read_character_contracts.v1'] as string[],
  contracts: vi.fn(),
  /** The network: what ESI answers for a contract's items, or null for a failure. */
  items: vi.fn(),
  /** The status of the failure `items` returned null for. */
  failure: { status: 0 },
  /** Skip the stored rows: every read goes to the network. */
  noCache: false,
  detailed: vi.fn(),
  requests: vi.fn(),
  pledges: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: { tokens: { get: async () => ({ scopes: mocks.scopes }) } },
}));
vi.mock('@/features/character/contracts', () => ({ loadContracts: mocks.contracts }));
vi.mock('@/features/character/contractItems', () => ({
  loadContractItemsDetailed: mocks.detailed,
}));
// The board (`mocks.requests`) and every Pledge on it (`mocks.pledges`), read the way the
// sweep reads them: only this Character's Pledges, then only the Requests they are on.
vi.mock('./requestStore', () => ({
  loadRequestsById: async (_c: number, _community: string, ids: readonly string[]) =>
    ((await mocks.requests()) as CommunityRequest[]).filter((r) => ids.includes(r.id)),
  loadMyPledges: async () => {
    const all = (await mocks.pledges()) as Map<string, RequestPledge[]>;
    const mine = new Map<string, RequestPledge>();
    for (const [id, list] of all) {
      const own = list.find((p) => p.uid === `char:${ME}`);
      if (own) mine.set(id, own);
    }
    return mine;
  },
  updateMyPledge: mocks.update,
}));

import { notePledgeEdit } from './pledgeWrites';
import { syncRequestDeliveries, toDeliveryItem } from './requestDelivery';

const ME = 11;
const REQUESTER = 22;
const NOW = Date.parse('2026-10-15T00:00:00Z');
const DONE = Date.parse('2026-10-13T00:00:00Z');

const request = (over: Partial<CommunityRequest> = {}): CommunityRequest => ({
  id: 'r1',
  ownerUid: `char:${REQUESTER}`,
  ownerName: 'Aria',
  location: '',
  terms: '',
  lines: [
    { typeId: 100, name: 'Ore', quantity: 500, kind: 'item' },
    { typeId: 200, name: 'Ishtar Blueprint', quantity: 1, kind: 'bpc', runs: 10, me: 10 },
  ],
  createdAt: NOW - 5 * 86_400_000,
  lastActivityAt: NOW,
  expiresAt: NOW + 20 * 86_400_000,
  closed: false,
  notify: { app: true, mail: false },
  ...over,
});

const pledge = (lines: Record<number, PledgeEntry>): RequestPledge => ({
  uid: `char:${ME}`,
  lines,
  updatedAt: NOW,
});

const contract = (id: number, over: Record<string, unknown> = {}) => ({
  contract_id: id,
  issuer_id: ME,
  issuer_corporation_id: 1,
  assignee_id: REQUESTER,
  acceptor_id: REQUESTER,
  type: 'item_exchange',
  status: 'finished',
  for_corporation: false,
  availability: 'personal',
  date_issued: '2026-10-12T00:00:00Z',
  date_completed: '2026-10-13T00:00:00Z',
  price: 123456789,
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.failure.status = 0;
  mocks.noCache = false;
  // Like production: a first read goes to the network and is stored; a repeat is a fresh row
  // (fromCache false, no network); a failure carries the status ESI answered with.
  const rows = new Map<number, unknown>();
  mocks.detailed.mockImplementation(async (characterId: number, contractId: number) => {
    if (!mocks.noCache && rows.has(contractId)) {
      return {
        result: { data: rows.get(contractId), fromCache: false, fetchedAt: new Date() },
        networkRead: false,
      };
    }
    const answer = (await mocks.items(characterId, contractId)) as { data: unknown } | null;
    if (!answer) return { result: null, networkRead: true, failureStatus: mocks.failure.status };
    rows.set(contractId, answer.data);
    return {
      result: { data: answer.data, fromCache: false, fetchedAt: new Date() },
      networkRead: true,
    };
  });
  mocks.scopes = ['esi-contracts.read_character_contracts.v1'];
  mocks.requests.mockResolvedValue([request()]);
  mocks.pledges.mockResolvedValue(
    new Map([['r1', [pledge({ 0: { quantity: 300, delivered: 0, contractIds: [] } })]]])
  );
  mocks.contracts.mockResolvedValue({
    cached: { data: [contract(7)], truncated: false },
    needsReauth: false,
  });
  mocks.items.mockResolvedValue({
    data: [
      { record_id: 1, type_id: 100, quantity: 120, is_included: true, is_singleton: false },
      { record_id: 2, type_id: 999, quantity: 1, is_included: true, is_singleton: false },
    ],
  });
  mocks.update.mockImplementation(async (_c, _g, _r, change) => change({}));
});

describe('toDeliveryItem', () => {
  it('reads blueprint copies and originals, and skips what the issuer asks for', () => {
    const base = { record_id: 1, type_id: 200, quantity: 1, is_included: true, is_singleton: true };
    expect(toDeliveryItem({ ...base, raw_quantity: -2, runs: 10 })?.blueprint).toBe('copy');
    expect(toDeliveryItem({ ...base, raw_quantity: -1 })?.blueprint).toBe('original');
    expect(toDeliveryItem({ ...base, is_singleton: false })?.blueprint).toBeNull();
    expect(toDeliveryItem({ ...base, is_included: false })).toBeNull();
  });
});

describe('syncRequestDeliveries', () => {
  it('asks for the Permission, not an error, when the contracts scope is missing', async () => {
    mocks.scopes = [];
    const result = await syncRequestDeliveries(ME, 'c1', NOW);
    expect(result.status).toBe('needs-scope');
    expect(mocks.contracts).not.toHaveBeenCalled();
  });

  it('marks a finished contract on the Pledge, writing only the line, delivered and contract ids', async () => {
    const result = await syncRequestDeliveries(ME, 'c1', NOW);
    expect(result).toMatchObject({ status: 'ok', updated: 1 });
    const change = mocks.update.mock.calls[0]?.[3] as (l: Record<number, PledgeEntry>) => unknown;
    const written = change({ 0: { quantity: 300, delivered: 0, contractIds: [] } });
    expect(written).toEqual({
      0: { quantity: 300, delivered: 120, contractIds: [7], auto: 120, through: DONE },
    });
    expect(JSON.stringify(mocks.update.mock.calls)).not.toContain('123456789');
  });

  it('keeps an amount typed after the run read the Pledge, and drops one cleared meanwhile', async () => {
    await syncRequestDeliveries(ME, 'c1', NOW);
    const change = mocks.update.mock.calls[0]?.[3] as (l: Record<number, PledgeEntry>) => unknown;
    // Typed 200 while the run was in flight: contracts show 120, the typed amount stands.
    expect(change({ 0: { quantity: 300, delivered: 200, contractIds: [], manual: 200 } })).toEqual({
      0: {
        quantity: 300,
        delivered: 200,
        contractIds: [7],
        manual: 200,
        auto: 120,
        through: DONE,
      },
    });
  });

  it('does not write back a typed amount the Member cleared while the run was in flight', async () => {
    mocks.pledges.mockResolvedValue(
      new Map([
        ['r1', [pledge({ 0: { quantity: 300, delivered: 250, contractIds: [], manual: 250 } })]],
      ])
    );
    await syncRequestDeliveries(ME, 'c1', NOW);
    const change = mocks.update.mock.calls[0]?.[3] as (l: Record<number, PledgeEntry>) => unknown;
    expect(change({ 0: { quantity: 300, delivered: 0, contractIds: [] } })).toEqual({
      0: { quantity: 300, delivered: 120, contractIds: [7], auto: 120, through: DONE },
    });
  });

  it('does not join, nor let write, a run that began before a hand edit of the Pledge', async () => {
    let release: (value: unknown) => void = () => undefined;
    const held = new Promise((resolve) => (release = resolve));
    const open = { cached: { data: [contract(7)], truncated: false }, needsReauth: false };
    mocks.contracts.mockReturnValueOnce(held.then(() => open)).mockResolvedValue(open);
    const stale = syncRequestDeliveries(ME, 'c1', NOW);
    // The Member clears or re-pledges while that run is still reading.
    notePledgeEdit(ME, 'c1');
    const fresh = await syncRequestDeliveries(ME, 'c1', NOW);
    expect(fresh.updated).toBe(1);
    expect(mocks.contracts).toHaveBeenCalledTimes(2);
    release(undefined);
    await stale;
    // Only the fresh run wrote.
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it('leaves a Pledge withdrawn and pledged afresh meanwhile alone', async () => {
    mocks.pledges.mockResolvedValue(
      new Map([
        [
          'r1',
          [pledge({ 0: { quantity: 300, delivered: 40, contractIds: [3], auto: 40, through: 1 } })],
        ],
      ])
    );
    await syncRequestDeliveries(ME, 'c1', NOW);
    const change = mocks.update.mock.calls[0]?.[3] as (l: Record<number, PledgeEntry>) => unknown;
    const fresh = { 0: { quantity: 300, delivered: 0, contractIds: [] } };
    expect(change(fresh)).toEqual(fresh);
  });

  it('adds only a new contract to a Pledge whose earlier one has aged out', async () => {
    mocks.pledges.mockResolvedValue(
      new Map([
        [
          'r1',
          [pledge({ 0: { quantity: 300, delivered: 40, contractIds: [3], auto: 40, through: 1 } })],
        ],
      ])
    );
    await syncRequestDeliveries(ME, 'c1', NOW);
    const change = mocks.update.mock.calls[0]?.[3] as (l: Record<number, PledgeEntry>) => unknown;
    expect(
      change({ 0: { quantity: 300, delivered: 40, contractIds: [3], auto: 40, through: 1 } })
    ).toEqual({
      0: { quantity: 300, delivered: 160, contractIds: [3, 7], auto: 160, through: DONE },
    });
  });

  it('writes nothing when the stored Pledge already matches (idempotent)', async () => {
    mocks.pledges.mockResolvedValue(
      new Map([
        [
          'r1',
          [
            pledge({
              0: { quantity: 300, delivered: 120, contractIds: [7], auto: 120, through: DONE },
            }),
          ],
        ],
      ])
    );
    const result = await syncRequestDeliveries(ME, 'c1', NOW);
    expect(result).toMatchObject({ status: 'ok', updated: 0 });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('never reads contracts of others, other statuses or to other pilots', async () => {
    mocks.contracts.mockResolvedValue({
      cached: {
        data: [
          contract(1, { issuer_id: 99 }),
          contract(2, { status: 'outstanding' }),
          contract(3, { assignee_id: 33, acceptor_id: 33 }),
        ],
        truncated: false,
      },
      needsReauth: false,
    });
    await syncRequestDeliveries(ME, 'c1', NOW);
    expect(mocks.items).not.toHaveBeenCalled();
  });

  it('flags a BPC delivered with other runs and counts it', async () => {
    mocks.pledges.mockResolvedValue(
      new Map([['r1', [pledge({ 1: { quantity: 1, delivered: 0, contractIds: [] } })]]])
    );
    mocks.items.mockResolvedValue({
      data: [
        {
          record_id: 1,
          type_id: 200,
          quantity: 1,
          is_included: true,
          is_singleton: true,
          raw_quantity: -2,
          runs: 5,
        },
      ],
    });
    const result = await syncRequestDeliveries(ME, 'c1', NOW);
    expect(result.updated).toBe(1);
    expect(result.flags.get('r1#1')).toEqual([
      { contractId: 7, attribute: 'runs', asked: 10, got: 5 },
    ]);
  });

  it('says so, and writes nothing, when the contracts cannot be read', async () => {
    mocks.contracts.mockResolvedValue({ cached: null, needsReauth: false, fetchFailed: true });
    const result = await syncRequestDeliveries(ME, 'c1', NOW);
    expect(result.status).toBe('read-failed');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('is quiet about a Request that closed meanwhile, loud about a denial for any other reason', async () => {
    const denied = () => Object.assign(new Error('x'), { code: 'permission-denied' });
    // Still open when read back: the denial is something else.
    mocks.update.mockRejectedValueOnce(denied());
    expect((await syncRequestDeliveries(ME, 'c1', NOW)).status).toBe('write-failed');
    // Closed when read back: nothing to say.
    mocks.update.mockRejectedValueOnce(denied());
    mocks.requests
      .mockResolvedValueOnce([request()])
      .mockResolvedValueOnce([request({ closed: true })]);
    expect((await syncRequestDeliveries(ME, 'c1', NOW)).status).toBe('ok');
    mocks.update.mockRejectedValueOnce(new Error('offline'));
    expect((await syncRequestDeliveries(ME, 'c1', NOW)).status).toBe('write-failed');
  });

  it('reports a failed save when it cannot tell whether the Request closed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.update.mockRejectedValueOnce(
      Object.assign(new Error('x'), { code: 'permission-denied' })
    );
    mocks.requests.mockResolvedValueOnce([request()]).mockRejectedValueOnce(new Error('offline'));
    expect((await syncRequestDeliveries(ME, 'c1', NOW)).status).toBe('write-failed');
  });

  it('credits only the Request of the pilot the contract went to', async () => {
    const other = request({
      id: 'r2',
      ownerUid: 'char:33',
      createdAt: NOW - 4 * 86_400_000,
    });
    mocks.requests.mockResolvedValue([request(), other]);
    mocks.pledges.mockResolvedValue(
      new Map([
        ['r1', [pledge({ 0: { quantity: 300, delivered: 0, contractIds: [] } })]],
        ['r2', [pledge({ 0: { quantity: 300, delivered: 0, contractIds: [] } })]],
      ])
    );
    await syncRequestDeliveries(ME, 'c1', NOW);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.calls[0]?.[2]).toBe('r1');
  });

  it('never gives up on a contract for transient failures, however many', async () => {
    mocks.contracts.mockResolvedValue({
      cached: { data: [contract(41), contract(42)], truncated: false },
      needsReauth: false,
    });
    mocks.items.mockResolvedValue(null);
    for (let run = 0; run < 4; run += 1) {
      expect((await syncRequestDeliveries(ME, 'c1', NOW + run * 60 * 60_000)).status).toBe(
        'read-failed'
      );
    }
    // Stops at the first failure each time, and keeps retrying the same contract.
    expect(mocks.items.mock.calls.map((c) => c[1])).toEqual([41, 41, 41, 41]);
  });

  it('gives up on a contract ESI keeps answering 404 for, over time, and releases what followed', async () => {
    const early = contract(51, { date_completed: '2026-10-11T00:00:00Z' });
    const later = [52, 53, 54].map((id, i) =>
      contract(id, { date_completed: `2026-10-1${2 + i}T00:00:00Z` })
    );
    mocks.contracts.mockResolvedValue({
      cached: { data: [...later, early], truncated: false },
      needsReauth: false,
    });
    mocks.failure.status = 404;
    mocks.items.mockImplementation(async (_c: number, id: number) =>
      id === 51
        ? null
        : {
            data: [
              { record_id: 1, type_id: 100, quantity: 10, is_included: true, is_singleton: false },
            ],
          }
    );
    let stored: Record<number, PledgeEntry> = {
      0: { quantity: 500, delivered: 0, contractIds: [] },
    };
    mocks.pledges.mockImplementation(async () => new Map([['r1', [pledge(stored)]]]));
    mocks.update.mockImplementation(async (_c, _g, _r, change) => {
      stored = change(stored) as Record<number, PledgeEntry>;
    });
    const MIN = 60_000;
    // Two 404s within a minute are a burst, not a verdict: what finished after 51 stays held back.
    await syncRequestDeliveries(ME, 'c1', NOW);
    await syncRequestDeliveries(ME, 'c1', NOW + MIN);
    expect(stored[0]?.auto ?? 0).toBe(0);
    // Two failures spanning minutes: given up. Skipped for good, the three later ones
    // count once, `through` advances past it, and it is never read again.
    await syncRequestDeliveries(ME, 'c1', NOW + 6 * MIN);
    expect(stored[0]).toMatchObject({ auto: 30, through: Date.parse('2026-10-14T00:00:00Z') });
    await syncRequestDeliveries(ME, 'c1', NOW + 7 * MIN);
    expect(stored[0]?.auto).toBe(30);
    expect(mocks.items.mock.calls.filter((c) => c[1] === 51)).toHaveLength(2);
  });

  it('treats a 403 as a missing Permission: it gives up on nothing and asks for the grant', async () => {
    mocks.contracts.mockResolvedValue({
      cached: { data: [contract(61), contract(62)], truncated: false },
      needsReauth: false,
    });
    mocks.failure.status = 403;
    mocks.items.mockResolvedValue(null);
    const MIN = 60_000;
    expect((await syncRequestDeliveries(ME, 'c1', NOW)).status).toBe('needs-scope');
    expect((await syncRequestDeliveries(ME, 'c1', NOW + 6 * MIN)).status).toBe('needs-scope');
    expect(mocks.update).not.toHaveBeenCalled();
    // Still tried each run: nothing was given up.
    mocks.failure.status = 0;
    mocks.items.mockClear();
    await syncRequestDeliveries(ME, 'c1', NOW + 12 * MIN);
    expect(mocks.items.mock.calls[0]?.[1]).toBe(61);
  });

  it('forgets earlier failures of a contract once it reads', async () => {
    mocks.contracts.mockResolvedValue({
      cached: { data: [contract(71)], truncated: false },
      needsReauth: false,
    });
    mocks.noCache = true;
    mocks.failure.status = 404;
    const other = {
      data: [{ record_id: 1, type_id: 999, quantity: 5, is_included: true, is_singleton: false }],
    };
    const MIN = 60_000;
    mocks.items
      .mockResolvedValueOnce(null) // fails once
      .mockResolvedValueOnce(other) // reads
      .mockResolvedValueOnce(null) // fails once more, much later
      .mockResolvedValue(null);
    for (const at of [0, 1, 7, 8]) await syncRequestDeliveries(ME, 'c1', NOW + at * MIN);
    // One failure since the read: not given up, so the fourth run still tries it.
    expect(mocks.items).toHaveBeenCalledTimes(4);
  });

  it('reads only what could still change a result: 45 contracts take three runs, the second reads just the 5 left', async () => {
    const DAYS = 86_400_000;
    // 45 contracts, newest first as ESI lists them; contract n finished n days after day 0.
    const all = Array.from({ length: 45 }, (_, i) => 45 - i).map((n) =>
      contract(1000 + n, {
        date_completed: new Date(Date.parse('2026-09-01T00:00:00Z') + n * DAYS).toISOString(),
      })
    );
    mocks.contracts.mockResolvedValue({
      cached: { data: all, truncated: false },
      needsReauth: false,
    });
    mocks.items.mockResolvedValue({
      data: [{ record_id: 1, type_id: 100, quantity: 1, is_included: true, is_singleton: false }],
    });
    mocks.requests.mockResolvedValue([request({ createdAt: Date.parse('2026-08-01T00:00:00Z') })]);
    let stored: Record<number, PledgeEntry> = {
      0: { quantity: 500, delivered: 0, contractIds: [] },
    };
    mocks.pledges.mockImplementation(async () => new Map([['r1', [pledge(stored)]]]));
    mocks.update.mockImplementation(async (_c, _g, _r, change) => {
      stored = change(stored) as Record<number, PledgeEntry>;
    });
    const first = await syncRequestDeliveries(ME, 'c1', NOW);
    expect(first.status).toBe('read-failed');
    expect(mocks.items).toHaveBeenCalledTimes(40);
    // The 40 oldest are counted; the 5 newest wait for the next run.
    expect(stored[0]?.auto).toBe(40);
    mocks.items.mockClear();
    await syncRequestDeliveries(ME, 'c1', NOW);
    // Already counted contracts are not read again: only the 5 unread ones.
    expect(mocks.items.mock.calls.map((c) => c[1])).toEqual([1041, 1042, 1043, 1044, 1045]);
    expect(stored[0]?.auto).toBe(45);
    mocks.items.mockClear();
    const third = await syncRequestDeliveries(ME, 'c1', NOW);
    expect(third).toMatchObject({ status: 'ok', updated: 0 });
    expect(mocks.items).not.toHaveBeenCalled();
    expect(stored[0]?.auto).toBe(45);
  });

  it('skips Requests that are closed or the Member’s own', async () => {
    mocks.requests.mockResolvedValue([request({ closed: true })]);
    const result = await syncRequestDeliveries(ME, 'c1', NOW);
    expect(result.updated).toBe(0);
    expect(mocks.contracts).not.toHaveBeenCalled();
  });
});
