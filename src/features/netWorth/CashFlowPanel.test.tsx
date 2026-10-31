import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { shiftUtcDate, utcDay } from '@/engine/localDay';
import type { WalletJournalEntry } from '@/esi/endpoints';
import { loadAllCharactersJournals } from '@/features/character/walletJournalAll';
import { CashFlowPanel } from './CashFlowPanel';

vi.mock('@/features/character/walletJournalAll', () => ({
  loadAllCharactersJournals: vi.fn(),
}));
// Recharts draws nothing useful in jsdom; the maths are tested in the engine.
vi.mock('@/features/character/IskFlowChartBars', () => ({
  default: () => <div data-testid="bars" />,
}));

const today = utcDay(Date.now());
let id = 0;
const line = (daysAgo: number, amount: number): WalletJournalEntry => ({
  id: ++id,
  date: `${shiftUtcDate(today, -daysAgo)}T12:00:00Z`,
  ref_type: 'bounty_prize',
  description: '',
  amount,
  balance: 0,
});

function load(journal: WalletJournalEntry[], truncated = false) {
  vi.mocked(loadAllCharactersJournals).mockResolvedValue({
    loaded: [
      {
        characterId: 1,
        name: 'Ava',
        journal,
        transactions: [],
        truncated,
        fillsTruncated: false,
        fetchedAt: new Date(),
      },
    ],
    skipped: [],
    typeNames: new Map(),
  });
}

const renderPanel = () =>
  render(
    <MemoryRouter>
      <CashFlowPanel characters={[{ characterId: 1, name: 'Ava' }]} />
    </MemoryRouter>
  );

beforeEach(() => vi.clearAllMocks());

describe('CashFlowPanel', () => {
  it('shows earned, spent and net for 30 days, and a Journal link', async () => {
    load([line(0, 1000), line(3, -250), line(40, 500), line(55, 800)]);
    renderPanel();
    expect(await screen.findByText('1,000 ISK')).toBeInTheDocument();
    expect(screen.getByText('250 ISK')).toBeInTheDocument();
    expect(screen.getByText(/\+750/)).toBeInTheDocument();
    expect(await screen.findByTestId('bars')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Journal' })).toHaveAttribute(
      'href',
      '/wallet/journal'
    );
  });

  it('compares with the 30 days before when the history reaches that far', async () => {
    load([line(0, 1500), line(40, 1000), line(59, 0)]);
    renderPanel();
    expect(
      await screen.findByText(/Earned is \+50% on the 30 days before \(1,000 ISK\)/)
    ).toBeInTheDocument();
  });

  it('narrows to 7 days', async () => {
    load([line(0, 1000), line(10, 4000)]);
    const user = userEvent.setup();
    renderPanel();
    expect(await screen.findByText('5,000 ISK')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '7d' }));
    expect(screen.getByText('1,000 ISK')).toBeInTheDocument();
    expect(screen.queryByText('5,000 ISK')).not.toBeInTheDocument();
  });

  it('says when the history starts inside the period', async () => {
    load([line(5, 100)]);
    renderPanel();
    expect(await screen.findByText(/Journal history starts/)).toBeInTheDocument();
  });

  it('draws nothing when no Character journal loaded', async () => {
    vi.mocked(loadAllCharactersJournals).mockResolvedValue({
      loaded: [],
      skipped: [],
      typeNames: new Map(),
    });
    renderPanel();
    await vi.waitFor(() => expect(loadAllCharactersJournals).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('heading', { name: 'Cash flow' })).not.toBeInTheDocument();
  });
});
