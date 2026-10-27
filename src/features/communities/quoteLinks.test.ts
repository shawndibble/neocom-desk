import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contract } from '@/esi/endpoints';
import type { CommunityRequest } from '@/engine/communities/requests';
import type { HeldQuote } from '@/engine/communities/buyback';
import { syncQuoteLinks } from './quoteLinks';

const mocks = vi.hoisted(() => ({
  loadContracts: vi.fn(),
  loadContractItemsDetailed: vi.fn(),
  saveQuoteLinks: vi.fn(),
}));
vi.mock('@/features/character/contracts', () => ({ loadContracts: mocks.loadContracts }));
vi.mock('@/features/character/contractItems', () => ({
  loadContractItemsDetailed: mocks.loadContractItemsDetailed,
}));
vi.mock('./requestStore', () => ({ saveQuoteLinks: mocks.saveQuoteLinks }));

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-20T12:00:00Z');
const SELLER = 100;
const BUYER = 200;

const request = (over: Partial<CommunityRequest['standing']> = {}): CommunityRequest => ({
  id: 'r1',
  ownerUid: 'char:200',
  ownerName: 'Mara',
  location: '',
  terms: '',
  lines: [],
  createdAt: 0,
  lastActivityAt: 0,
  expiresAt: 0,
  closed: false,
  notify: { app: true, mail: false },
  standing: {
    rate: 90,
    rateBasis: 'buy',
    hubId: 'jita',
    buyerCharacterId: null,
    buyLines: [{ kind: 'group', group: 'ore' }],
    ...over,
  },
});
const quote = (over: Partial<HeldQuote> = {}): HeldQuote => ({
  lines: [{ typeId: 1230, name: 'Veldspar', quantity: 1000, unitPrice: 10, total: 9000 }],
  total: 9000,
  quotedAt: NOW - 3 * DAY,
  expiresAt: NOW + 11 * DAY,
  ...over,
});
const contract = (over: Partial<Contract> = {}): Contract =>
  ({
    contract_id: 11,
    issuer_id: SELLER,
    issuer_corporation_id: 1,
    assignee_id: BUYER,
    acceptor_id: 0,
    type: 'item_exchange',
    status: 'outstanding',
    for_corporation: false,
    availability: 'personal',
    date_issued: new Date(NOW - 2 * DAY).toISOString(),
    date_expired: new Date(NOW + 5 * DAY).toISOString(),
    price: 9000,
    ...over,
  }) as Contract;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.loadContractItemsDetailed.mockResolvedValue({
    result: { data: [{ type_id: 1230, quantity: 1000, is_included: true }] },
    networkRead: false,
  });
  mocks.saveQuoteLinks.mockResolvedValue(undefined);
});

describe('syncQuoteLinks', () => {
  it('links the seller’s contract to the buyer and saves the id and status', async () => {
    mocks.loadContracts.mockResolvedValue({ cached: { data: [contract()], truncated: false } });
    const result = await syncQuoteLinks({
      characterId: SELLER,
      communityId: 'c1',
      request: request(),
      quote: quote(),
      now: NOW,
    });
    expect(result.status).toBe('ok');
    expect(result.links).toEqual([
      expect.objectContaining({ contractId: 11, status: 'outstanding', priceDiffers: false }),
    ]);
    expect(result.contracts.get(11)?.contract_id).toBe(11);
    expect(mocks.saveQuoteLinks).toHaveBeenCalledWith(SELLER, 'c1', 'r1', quote().quotedAt, [
      { contractId: 11, status: 'outstanding' },
    ]);
  });

  it('writes nothing when the stored links already say the same', async () => {
    mocks.loadContracts.mockResolvedValue({ cached: { data: [contract()], truncated: false } });
    await syncQuoteLinks({
      characterId: SELLER,
      communityId: 'c1',
      request: request(),
      quote: quote({ links: [{ contractId: 11, status: 'outstanding' }] }),
      now: NOW,
    });
    expect(mocks.saveQuoteLinks).not.toHaveBeenCalled();
  });

  it('sends the contract to the named buyer Character, not the requester', async () => {
    mocks.loadContracts.mockResolvedValue({
      cached: { data: [contract({ assignee_id: 555 })], truncated: false },
    });
    const result = await syncQuoteLinks({
      characterId: SELLER,
      communityId: 'c1',
      request: request({ buyerCharacterId: 555 }),
      quote: quote(),
      now: NOW,
    });
    expect(result.links).toHaveLength(1);
  });

  it('marks a contract at another price', async () => {
    mocks.loadContracts.mockResolvedValue({
      cached: { data: [contract({ price: 5000 })], truncated: false },
    });
    const result = await syncQuoteLinks({
      characterId: SELLER,
      communityId: 'c1',
      request: request(),
      quote: quote(),
      now: NOW,
    });
    expect(result.links[0].priceDiffers).toBe(true);
  });

  it('reads no items for a contract that is not to the buyer, or older than the quote', async () => {
    mocks.loadContracts.mockResolvedValue({
      cached: {
        data: [
          contract({ contract_id: 21, assignee_id: 9 }),
          contract({ contract_id: 22, date_issued: new Date(NOW - 9 * DAY).toISOString() }),
        ],
        truncated: false,
      },
    });
    const result = await syncQuoteLinks({
      characterId: SELLER,
      communityId: 'c1',
      request: request(),
      quote: quote(),
      now: NOW,
    });
    expect(result.links).toEqual([]);
    expect(mocks.loadContractItemsDetailed).not.toHaveBeenCalled();
  });

  it('asks for the Permission when the contracts scope is missing', async () => {
    mocks.loadContracts.mockResolvedValue({ needsReauth: true, cached: null });
    const result = await syncQuoteLinks({
      characterId: SELLER,
      communityId: 'c1',
      request: request(),
      quote: quote(),
      now: NOW,
    });
    expect(result.status).toBe('needs-scope');
  });

  it('says so when contracts or items cannot be read, and keeps what was stored', async () => {
    mocks.loadContracts.mockResolvedValue({ cached: null });
    expect(
      (
        await syncQuoteLinks({
          characterId: SELLER,
          communityId: 'c1',
          request: request(),
          quote: quote(),
          now: NOW,
        })
      ).status
    ).toBe('read-failed');
    mocks.loadContracts.mockResolvedValue({ cached: { data: [contract()], truncated: false } });
    mocks.loadContractItemsDetailed.mockResolvedValue({
      result: null,
      networkRead: true,
      failureStatus: 0,
    });
    const result = await syncQuoteLinks({
      characterId: SELLER,
      communityId: 'c1',
      request: request(),
      quote: quote(),
      now: NOW,
    });
    expect(result.status).toBe('read-failed');
    expect(mocks.saveQuoteLinks).not.toHaveBeenCalled();
  });
});
