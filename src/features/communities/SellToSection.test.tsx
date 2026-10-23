import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { CommunityRequest, RequestPledge } from '@/engine/communities/requests';
import { SellToSection } from './SellToSection';

const mocks = vi.hoisted(() => ({ quotePile: vi.fn(), saveMyQuote: vi.fn() }));
vi.mock('./sellTo', () => ({ quotePile: mocks.quotePile }));
vi.mock('./requestStore', () => ({ saveMyQuote: mocks.saveMyQuote }));
vi.mock('@/components/ui/NeedsConnection', () => ({
  NeedsConnection: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;
const request: CommunityRequest = {
  id: 'r1',
  ownerUid: 'char:9',
  ownerName: 'Mara Quill',
  location: '',
  terms: '',
  lines: [],
  createdAt: NOW,
  lastActivityAt: NOW,
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
const heldQuote = (over: Partial<NonNullable<RequestPledge['quote']>> = {}) => ({
  lines: [{ typeId: 1230, name: 'Veldspar', quantity: 1000, unitPrice: 10, total: 9000 }],
  total: 9000,
  quotedAt: NOW - DAY,
  expiresAt: NOW + 13 * DAY,
  ...over,
});
const pledge = (quote?: RequestPledge['quote']): RequestPledge => ({
  uid: 'char:1',
  lines: {},
  ...(quote ? { quote } : {}),
  updatedAt: NOW,
});

const refreshPledges = vi.fn().mockResolvedValue([]);
function setup(myPledge?: RequestPledge) {
  render(
    <SellToSection
      request={request}
      characterId={1}
      communityId="c1"
      myPledge={myPledge}
      buyerName="Mara Quill"
      now={NOW}
      refreshPledges={refreshPledges}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  refreshPledges.mockResolvedValue([]);
});

describe('SellToSection', () => {
  it('shows a held quote: the one figure, the buyer and the day it is held until', () => {
    setup(pledge(heldQuote()));
    expect(screen.getByText('9,000 ISK')).toBeInTheDocument();
    expect(screen.getByText(/Held until/)).toBeInTheDocument();
    expect(
      screen.getByText(/item exchange contract to Mara Quill for 9,000 ISK/)
    ).toBeInTheDocument();
  });

  it('says a quote has expired and no longer tells the Member to contract it', () => {
    setup(pledge(heldQuote({ expiresAt: NOW - 1 })));
    expect(screen.getByText(/Expired/)).toBeInTheDocument();
    expect(screen.queryByText(/item exchange contract/)).not.toBeInTheDocument();
  });

  it('prices a paste, holds the quote and re-reads the Pledges', async () => {
    const quote = heldQuote();
    mocks.quotePile.mockResolvedValue({
      quote,
      notBought: [],
      unpriced: [],
      unmatched: [],
      dropped: 0,
    });
    mocks.saveMyQuote.mockResolvedValue(null);
    setup();
    await userEvent.type(screen.getByRole('textbox'), 'Veldspar 1000');
    await userEvent.click(screen.getByRole('button', { name: 'Get quote' }));
    await waitFor(() => expect(mocks.saveMyQuote).toHaveBeenCalledWith(1, 'c1', 'r1', quote));
    expect(mocks.quotePile).toHaveBeenCalledWith(
      'Veldspar 1000',
      request.standing,
      expect.any(Number)
    );
    await waitFor(() => expect(refreshPledges).toHaveBeenCalledWith('r1'));
  });

  it('keeps the held quote and says why when nothing in the paste is bought', async () => {
    mocks.quotePile.mockResolvedValue({
      quote: { ...heldQuote(), lines: [], total: 0 },
      notBought: [{ typeId: 587, name: 'Rifter' }],
      unpriced: [],
      unmatched: [],
      dropped: 0,
    });
    setup(pledge(heldQuote()));
    await userEvent.type(screen.getByRole('textbox'), 'Rifter 1');
    await userEvent.click(screen.getByRole('button', { name: 'Get quote' }));
    expect(await screen.findByText(/there is no quote/)).toBeInTheDocument();
    expect(screen.getByText(/Not bought here, left out: Rifter/)).toBeInTheDocument();
    expect(mocks.saveMyQuote).not.toHaveBeenCalled();
  });

  it('clears a held quote', async () => {
    mocks.saveMyQuote.mockResolvedValue(null);
    setup(pledge(heldQuote()));
    await userEvent.click(screen.getByRole('button', { name: 'Clear quote' }));
    await waitFor(() => expect(mocks.saveMyQuote).toHaveBeenCalledWith(1, 'c1', 'r1', null));
  });

  it('says so when the quote could not be made', async () => {
    mocks.quotePile.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setup();
    await userEvent.type(screen.getByRole('textbox'), 'Veldspar 1');
    await userEvent.click(screen.getByRole('button', { name: 'Get quote' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t get a quote');
  });
});
