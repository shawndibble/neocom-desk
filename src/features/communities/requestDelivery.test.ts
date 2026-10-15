import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommunityRequest, PledgeEntry, RequestPledge } from '@/engine/communities/requests';

const mocks = vi.hoisted(() => ({
  scopes: ['esi-contracts.read_character_contracts.v1'] as string[],
  contracts: vi.fn(),
  items: vi.fn(),
  requests: vi.fn(),
  pledges: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: { tokens: { get: async () => ({ scopes: mocks.scopes }) } },
}));
vi.mock('@/features/character/contracts', () => ({ loadContracts: mocks.contracts }));
vi.mock('@/features/character/contractItems', () => ({ loadContractItems: mocks.items }));
vi.mock('./requestStore', () => ({
  loadRequests: mocks.requests,
  loadCommunityPledges: mocks.pledges,
  updateMyPledge: mocks.update,
}));

import { syncRequestDeliveries, toDeliveryItem } from './requestDelivery';

const ME = 11;
const REQUESTER = 22;
const NOW = Date.parse('2026-10-15T00:00:00Z');

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
    expect(written).toEqual({ 0: { quantity: 300, delivered: 120, contractIds: [7] } });
    expect(JSON.stringify(mocks.update.mock.calls)).not.toContain('123456789');
  });

  it('writes nothing when the stored Pledge already matches (idempotent)', async () => {
    mocks.pledges.mockResolvedValue(
      new Map([['r1', [pledge({ 0: { quantity: 300, delivered: 120, contractIds: [7] } })]]])
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

  it('stops reading items at the first failed read and gives up on a contract that keeps failing', async () => {
    mocks.contracts.mockResolvedValue({
      cached: { data: [contract(41), contract(42)], truncated: false },
      needsReauth: false,
    });
    mocks.items.mockResolvedValue(null);
    expect((await syncRequestDeliveries(ME, 'c1', NOW)).status).toBe('read-failed');
    expect(mocks.items).toHaveBeenCalledTimes(1);
    await syncRequestDeliveries(ME, 'c1', NOW);
    expect(mocks.items).toHaveBeenCalledTimes(2);
    mocks.items.mockClear();
    // 41 is now given up on; 42 is tried (and fails once).
    await syncRequestDeliveries(ME, 'c1', NOW);
    expect(mocks.items).toHaveBeenCalledTimes(1);
    expect(mocks.items.mock.calls[0]?.[1]).toBe(42);
  });

  it('skips Requests that are closed or the Member’s own', async () => {
    mocks.requests.mockResolvedValue([request({ closed: true })]);
    const result = await syncRequestDeliveries(ME, 'c1', NOW);
    expect(result.updated).toBe(0);
    expect(mocks.contracts).not.toHaveBeenCalled();
  });
});
