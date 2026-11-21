import { describe, expect, it, vi } from 'vitest';
import { readAudit } from '../taxBook/bookClient';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { BookProvider } from './BookContext';
import { BOOK_CONTEXT, BOOK_VIEW, MOON_ID, VARRO_ID } from './corpBookFixture';
import { buildBookView } from '@/engine/corpTaxBook/bookView';
import { MinerDetail } from './MinerDetail';
import { MoonDetail } from './MoonDetail';
import { OverviewTab } from './OverviewTab';

vi.mock('../taxBook/bookClient', () => ({
  editBook: vi.fn(),
  readAudit: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/features/corpTaxBook/mailQueueStore', () => ({
  listQueue: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/features/character/useEntityName', () => ({ useEntityName: () => 'Ore & Glory' }));

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

function renderBook(ui: React.ReactElement, context = BOOK_CONTEXT) {
  return render(
    <MemoryRouter initialEntries={['/corp/moons']}>
      <BookProvider value={context}>{ui}</BookProvider>
    </MemoryRouter>
  );
}

describe('Overview', () => {
  it('orders Fractured, Ready, then moons popping in the next 7 days', () => {
    renderBook(<OverviewTab />);
    const schedule = screen.getByRole('heading', { level: 2, name: 'Moons' }).closest('section')!;
    const titles = within(schedule)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(titles).toEqual(['Fractured · 1', 'Ready · 1', 'Pops in the next 7 days · 1']);
  });
});

describe('Miner page', () => {
  it('is one scroll of sections with counts and no tabs', () => {
    renderBook(<MinerDetail id={VARRO_ID} />);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    for (const title of [
      /^Owed days · /,
      /^Today's mining · 1/,
      /^Earlier days · /,
      /^Payments · 1/,
      /^Activity · 0/,
    ])
      expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.queryByText(/^Moons · /)).not.toBeInTheDocument();
  });

  it("lists Today's mining above Owed days, then Earlier days", () => {
    renderBook(<MinerDetail id={VARRO_ID} />);
    const order = [/^Today's mining · /, /^Owed days · /, /^Earlier days · /].map((re) =>
      screen.getByText(re)
    );
    for (let i = 1; i < order.length; i++)
      expect(
        order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
  });

  it('sorts the Payments ledger by When, From and Amount', () => {
    renderBook(<MinerDetail id={VARRO_ID} />);
    const payments = screen.getByRole('table', { name: 'Payments' });
    for (const name of [/^When/, /^From/, /^Amount/])
      expect(within(payments).getByRole('button', { name })).toBeInTheDocument();
  });

  it('keeps the characters panel reachable from the header', async () => {
    renderBook(<MinerDetail id={VARRO_ID} />);
    await userEvent.click(screen.getByRole('button', { name: '2 characters' }));
    expect(await screen.findByRole('button', { name: 'Group with' })).toBeInTheDocument();
  });

  it('says so, with no chips, when nothing has happened for the Miner', () => {
    renderBook(<MinerDetail id={VARRO_ID} />);
    expect(screen.getByText('Nothing has happened for this Miner yet.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Filter activity' })).not.toBeInTheDocument();
  });

  it('counts a mailed late notice from the audit log under Mail, not Audit', async () => {
    vi.mocked(readAudit).mockResolvedValue([
      {
        id: 'a1',
        at: Date.parse('2026-10-20T10:00:00Z'),
        by: 1,
        byName: 'Test Pilot',
        action: 'recordLateNoticeMail',
        detail: { minerId: VARRO_ID, kind: 'notice' },
      },
    ]);
    renderBook(<MinerDetail id={VARRO_ID} />);
    const chips = await screen.findByRole('group', { name: 'Filter activity' });
    expect(within(chips).getByRole('button', { name: /^Mail/ })).toHaveTextContent('1');
    expect(within(chips).getByRole('button', { name: /^Audit/ })).toHaveTextContent('0');
    await userEvent.click(within(chips).getByRole('button', { name: /^Mail/ }));
    expect(await screen.findByText(/mailed a late notice/)).toBeInTheDocument();
    vi.mocked(readAudit).mockResolvedValue([]);
  });

  it('shows a moon once, with only the station under it', () => {
    renderBook(<MinerDetail id={VARRO_ID} />);
    const table = screen.getByRole('table', { name: 'Owed days' });
    expect(within(table).getAllByText('Efa V - Moon 3').length).toBeGreaterThan(0);
    expect(within(table).queryByText('Efa V - Moon 3 - Brass Anvil')).not.toBeInTheDocument();
    expect(within(table).getAllByText('Brass Anvil').length).toBeGreaterThan(0);
  });
});

describe('Miner page on a running account', () => {
  const view = buildBookView(BOOK_VIEW.input);
  const running = { ...BOOK_CONTEXT, view };

  it('lists Owed days and says where the Miner stands', () => {
    renderBook(<MinerDetail id={VARRO_ID} />, running);
    expect(screen.getByText(/^Owed days · /)).toBeInTheDocument();
    expect(screen.getByText('Oldest unpaid')).toBeInTheDocument();
    expect(screen.getByText('Last payment')).toBeInTheDocument();
    const owed = screen.getByRole('table', { name: /^Owed days/ });
    expect(within(owed).getAllByRole('row').length).toBeGreaterThan(1);
    expect(screen.getAllByText(/^Payment from /).length).toBeGreaterThan(0);
    // The one Payee ledger: owed reads positive, never as a minus.
    const ledger = screen.getByRole('table', { name: 'Account ledger' });
    expect(within(ledger).queryAllByText(/^\u2212[\d,]+/)).toHaveLength(0);
    expect(within(ledger).getAllByText(/^[\d,]+$/).length).toBeGreaterThan(0);
  });

  it('reads the past days and payments of the last 7 days', async () => {
    renderBook(<MinerDetail id={VARRO_ID} />, running);
    await userEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    expect(screen.getByText(/^Tax .* · paid /)).toBeInTheDocument();
    // What is owed now is never narrowed.
    expect(screen.getByRole('checkbox', { name: 'Select 2026-09-04' })).toBeInTheDocument();
  });
});

describe('Corrections', () => {
  it('sit in the header menu, and Rebill is gone: late ore changes the day itself', async () => {
    renderBook(<MinerDetail id={VARRO_ID} />);
    await userEvent.click(screen.getAllByRole('button', { name: 'More actions' })[0]);
    expect(await screen.findByRole('menuitem', { name: /rate/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Add a correction line' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Rebill from date' })).not.toBeInTheDocument();
  });
});

describe('Moon page', () => {
  it('merges Started and Arrived into one Extraction window and drops the This extraction box', () => {
    renderBook(<MoonDetail id={MOON_ID} />);
    expect(screen.getByText('Extraction window')).toBeInTheDocument();
    expect(screen.getByText(/\d+ \w{3} \u2013 \d+ \w{3} \(\d+ days?\)/)).toBeInTheDocument();
    expect(screen.queryByText('This extraction')).not.toBeInTheDocument();
    expect(screen.queryByText('Chunk arrived')).not.toBeInTheDocument();
    expect(screen.queryByText('Ore from')).not.toBeInTheDocument();
  });

  it('a Miner row opens the miner; only its caret opens the ore lines', async () => {
    renderBook(
      <>
        <MoonDetail id={MOON_ID} />
        <Where />
      </>
    );
    expect(
      screen.queryByRole('table', { name: /Ore mined by Varro Kestane/ })
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Ore mined by Varro Kestane/ }));
    expect(screen.getByRole('table', { name: /Ore mined by Varro Kestane/ })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/corp/moons');
    // The clicked row already carries the totals.
    expect(screen.queryByText('Total')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Varro Kestane'));
    expect(screen.getByTestId('where')).toHaveTextContent('/corp/moons/miners/');
  });
});
