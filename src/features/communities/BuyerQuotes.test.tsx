import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { Contract } from '@/esi/endpoints';
import type { CommunityRequest, RequestPledge } from '@/engine/communities/requests';
import { BuyerQuotes } from './BuyerQuotes';

const mocks = vi.hoisted(() => ({ loadContracts: vi.fn(), remember: vi.fn() }));
vi.mock('@/features/character/contracts', () => ({ loadContracts: mocks.loadContracts }));
vi.mock('./buybackLinks', () => ({ rememberBuybackLinks: mocks.remember }));
vi.mock('@/features/character/ContractDetailModal', () => ({ ContractDetailModal: () => null }));
vi.mock('@/features/character/names', () => ({
  resolveNames: vi.fn().mockResolvedValue(new Map()),
}));

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-20T12:00:00Z');
const request: CommunityRequest = {
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
  },
};
const pledge = (
  uid: string,
  over: Partial<NonNullable<RequestPledge['quote']>> = {}
): RequestPledge => ({
  uid,
  lines: {},
  quote: {
    lines: [{ typeId: 1230, name: 'Veldspar', quantity: 1000, unitPrice: 10, total: 9000 }],
    total: 9000,
    quotedAt: NOW - DAY,
    expiresAt: NOW + 13 * DAY,
    ...over,
  },
  updatedAt: NOW,
});
const contract = (over: Partial<Contract> = {}): Contract =>
  ({
    contract_id: 11,
    issuer_id: 100,
    issuer_corporation_id: 2,
    assignee_id: 200,
    acceptor_id: 0,
    type: 'item_exchange',
    status: 'outstanding',
    for_corporation: false,
    availability: 'personal',
    date_issued: new Date(NOW - DAY).toISOString(),
    date_expired: new Date(NOW + 5 * DAY).toISOString(),
    price: 9000,
    ...over,
  }) as Contract;

const show = (pledges: RequestPledge[]) =>
  render(
    <MemoryRouter>
      <BuyerQuotes
        request={request}
        pledges={pledges}
        memberNames={new Map([['char:100', 'Seller One']])}
        communityId="c1"
        communityName="Efa Miners"
        buyerCharacterId={200}
        now={NOW}
      />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.remember.mockResolvedValue(undefined);
});

describe('BuyerQuotes', () => {
  it('says so when no Member holds a quote', () => {
    show([]);
    expect(screen.getByText('No quotes held yet.')).toBeInTheDocument();
    expect(mocks.loadContracts).not.toHaveBeenCalled();
  });

  it('lists each Member’s quote without reading contracts when none is linked', () => {
    show([pledge('char:100')]);
    expect(screen.getByText('Seller One')).toBeInTheDocument();
    expect(screen.getByText('9,000 ISK')).toBeInTheDocument();
    expect(mocks.loadContracts).not.toHaveBeenCalled();
  });

  it('shows a linked contract with the price read from the buyer’s own contracts', async () => {
    mocks.loadContracts.mockResolvedValue({ cached: { data: [contract()], truncated: false } });
    show([pledge('char:100', { links: [{ contractId: 11, status: 'outstanding' }] })]);
    expect(await screen.findByRole('button')).toHaveTextContent('Outstanding');
    expect(screen.queryByText(/Price differs from quote/)).not.toBeInTheDocument();
  });

  it('marks a contract made at another price than the quote', async () => {
    mocks.loadContracts.mockResolvedValue({
      cached: { data: [contract({ price: 7000 })], truncated: false },
    });
    show([pledge('char:100', { links: [{ contractId: 11, status: 'outstanding' }] })]);
    expect(
      await screen.findByText('Price differs from quote · 9,000 ISK quoted')
    ).toBeInTheDocument();
  });

  it('shows the stored status when the buyer’s contracts cannot be read', async () => {
    mocks.loadContracts.mockResolvedValue({ needsReauth: true, cached: null });
    show([pledge('char:100', { links: [{ contractId: 11, status: 'finished' }] })]);
    expect(await screen.findByText('Finished')).toBeInTheDocument();
    expect(await screen.findByText(/needs a Permission you have not granted/)).toBeInTheDocument();
  });

  it('drops a link to a contract the Member did not make to the buyer', async () => {
    mocks.loadContracts.mockResolvedValue({
      cached: { data: [contract({ issuer_id: 999 })], truncated: false },
    });
    show([pledge('char:100', { links: [{ contractId: 11, status: 'finished' }] })]);
    await screen.findByText('Seller One');
    await vi.waitFor(() => expect(mocks.loadContracts).toHaveBeenCalled());
    expect(screen.queryByText('Finished')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await vi.waitFor(() => expect(mocks.remember).toHaveBeenLastCalledWith(200, new Map()));
  });

  it('says a link is only the Member’s word when the buyer cannot confirm it', async () => {
    mocks.loadContracts.mockResolvedValue({ needsReauth: true, cached: null });
    show([pledge('char:100', { links: [{ contractId: 11, status: 'finished' }] })]);
    expect(await screen.findByText('Not confirmed in your contracts')).toBeInTheDocument();
    await vi.waitFor(() => expect(mocks.remember).toHaveBeenLastCalledWith(200, new Map()));
  });

  it('remembers the linked contracts so the Contracts page can mark them', async () => {
    mocks.loadContracts.mockResolvedValue({ cached: { data: [contract()], truncated: false } });
    show([pledge('char:100', { links: [{ contractId: 11, status: 'outstanding' }] })]);
    await screen.findByRole('button');
    await vi.waitFor(() =>
      expect(mocks.remember).toHaveBeenCalledWith(
        200,
        new Map([
          [11, expect.objectContaining({ requestId: 'r1', communityId: 'c1', quotedTotal: 9000 })],
        ])
      )
    );
  });
});
