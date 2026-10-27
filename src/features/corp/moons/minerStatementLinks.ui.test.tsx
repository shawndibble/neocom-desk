import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { buildBookView } from '@/engine/corpTaxBook/bookView';
import { BookProvider } from './BookContext';
import { BOOK_CONTEXT, BOOK_VIEW, VARRO_ID } from './corpBookFixture';
import { MinerDetail } from './MinerDetail';

vi.mock('../taxBook/bookClient', () => ({
  editBook: vi.fn(),
  readAudit: vi.fn().mockResolvedValue([]),
  readVerifyTokens: vi.fn(),
}));
vi.mock('@/features/corpTaxBook/mailQueueStore', () => ({
  listQueue: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/features/character/useEntityName', () => ({ useEntityName: () => 'Ore & Glory' }));

/** Varro with three small older Statements and one donation that spills over all of them. */
function threeStatementView() {
  const { input } = BOOK_VIEW;
  const aug = input.statements.find((s) => s.minerId === VARRO_ID)!;
  const older = ['2026-05-01', '2026-06-01', '2026-07-01'].map((start, i) => ({
    ...aug,
    id: `old-${i}`,
    code: `OLD${i}`,
    periodStart: start,
    periodEnd: `${start.slice(0, 8)}28`,
    coversFrom: start,
    coversThrough: `${start.slice(0, 8)}28`,
    issuedAt: `${start}T10:00:00Z`,
    amount: 100_000,
    lines: [],
  }));
  return buildBookView({
    ...input,
    statements: [...input.statements, ...older],
    payments: [
      ...input.payments.filter((p) => ('minerId' in p ? p.minerId !== VARRO_ID : true)),
      {
        id: 'spill',
        minerId: VARRO_ID,
        characterId: 1,
        amount: 250_000,
        at: '2026-09-20T08:00:00Z',
        source: 'donation' as const,
      },
    ],
  });
}

function Where() {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
}

const renderMiner = (path = '/corp/moons/miners/g1') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <BookProvider value={{ ...BOOK_CONTEXT, view: threeStatementView() }}>
        <Where />
        <MinerDetail id={VARRO_ID} />
      </BookProvider>
    </MemoryRouter>
  );

describe('Miner page Statement links (#5288)', () => {
  it('a payment credited to three Statements shows two links with their amounts and +1 more', () => {
    renderMiner();
    const payments = screen.getByRole('table', { name: 'Payments' });
    expect(
      within(payments).getAllByRole('button', { name: /^Open the .* Statement$/ })
    ).toHaveLength(2);
    expect(within(payments).getByText('+1 more')).toHaveAttribute('tabindex', '0');
    expect(within(payments).getAllByText(/· 100,000/).length).toBeGreaterThan(0);
  });

  it('opens the panel from ?statement= without the Open Miner page link, and Close replaces the URL', async () => {
    renderMiner('/corp/moons/miners/g1?statement=old-0');
    const panel = await screen.findByRole('dialog');
    expect(within(panel).queryByRole('link', { name: 'Open Miner page' })).toBeNull();
    await userEvent.click(within(panel).getByRole('button', { name: /close/i }));
    expect(screen.getByTestId('search').textContent).toBe('');
  });

  it("a ?statement= that is not this Miner's says so and drops the param", async () => {
    renderMiner('/corp/moons/miners/g1?statement=nope');
    expect(await screen.findByText('Statement not found.')).toBeInTheDocument();
    expect(screen.getByTestId('search').textContent).toBe('');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
