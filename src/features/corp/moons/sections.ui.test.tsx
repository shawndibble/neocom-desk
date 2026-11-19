import { describe, expect, it, vi } from 'vitest';
import { readAudit } from '../taxBook/bookClient';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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
      /^Next Statement · 4/,
      /^Today's mining · 1/,
      /^Earlier days · 4/,
      /^Payments · 1/,
      /^Activity · 0/,
    ])
      expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.queryByText(/^Moons · /)).not.toBeInTheDocument();
  });

  it("lists Today's mining above Next Statement, then Earlier days", () => {
    renderBook(<MinerDetail id={VARRO_ID} />);
    const order = [/^Today's mining · /, /^Next Statement · /, /^Earlier days · /].map((re) =>
      screen.getByText(re)
    );
    for (let i = 1; i < order.length; i++)
      expect(
        order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
  });

  it("opens the Statement panel from a payment's Credited to link and from an Earlier day", async () => {
    renderBook(<MinerDetail id={VARRO_ID} />);
    const payments = screen.getByRole('table', { name: 'Payments' });
    await userEvent.click(
      within(payments).getAllByRole('button', { name: /^Open the .* Statement$/ })[0]
    );
    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByText('Remaining')).toBeInTheDocument();
    expect(within(panel).queryByRole('link', { name: 'Open Miner page' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const earlier = screen.getByRole('table', { name: 'Earlier days' });
    await userEvent.click(
      within(earlier).getAllByRole('button', { name: /^Open the .* Statement$/ })[0]
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
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

  it('counts a mailed Statement from the audit log under Mail, not Audit', async () => {
    vi.mocked(readAudit).mockResolvedValue([
      {
        id: 'a1',
        at: Date.parse('2026-10-20T10:00:00Z'),
        by: 1,
        byName: 'Test Pilot',
        action: 'recordMail',
        detail: { minerId: VARRO_ID, kind: 'statement' },
      },
    ]);
    renderBook(<MinerDetail id={VARRO_ID} />);
    const chips = await screen.findByRole('group', { name: 'Filter activity' });
    expect(within(chips).getByRole('button', { name: /^Mail/ })).toHaveTextContent('1');
    expect(within(chips).getByRole('button', { name: /^Audit/ })).toHaveTextContent('0');
    await userEvent.click(within(chips).getByRole('button', { name: /^Mail/ }));
    expect(await screen.findByText(/mailed a Statement/)).toBeInTheDocument();
    vi.mocked(readAudit).mockResolvedValue([]);
  });

  it('shows a moon once, with only the station under it', () => {
    renderBook(<MinerDetail id={VARRO_ID} />);
    const table = screen.getByRole('table', { name: 'Next Statement' });
    expect(within(table).getAllByText('Efa V - Moon 3').length).toBeGreaterThan(0);
    expect(within(table).queryByText('Efa V - Moon 3 - Brass Anvil')).not.toBeInTheDocument();
    expect(within(table).getAllByText('Brass Anvil').length).toBeGreaterThan(0);
  });
});

describe('Miner page on a running account', () => {
  const view = buildBookView({ ...BOOK_VIEW.input, runningAccountFrom: '2026-08-01T00:00:00Z' });
  const running = { ...BOOK_CONTEXT, view };

  it('lists Owed days and says where the Miner stands instead of a Next Statement', () => {
    renderBook(<MinerDetail id={VARRO_ID} />, running);
    expect(screen.queryByText(/^Next Statement · /)).not.toBeInTheDocument();
    expect(screen.getByText(/^Owed days · /)).toBeInTheDocument();
    expect(screen.getByText('Oldest unpaid')).toBeInTheDocument();
    expect(screen.getByText('Last payment')).toBeInTheDocument();
    // A day still on an unpaid older Statement is owed, so it lists here, not under Earlier days.
    const owed = screen.getByRole('table', { name: /^Owed days/ });
    expect(within(owed).getAllByRole('row').length).toBeGreaterThan(1);
    expect(screen.getAllByText(/^Payment from /).length).toBeGreaterThan(0);
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
  it('sit in the header menu, with Rebill only on a book that still bills Statements', async () => {
    renderBook(<MinerDetail id={VARRO_ID} />);
    await userEvent.click(screen.getAllByRole('button', { name: 'More actions' })[0]);
    expect(await screen.findByRole('menuitem', { name: /rate/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Add a correction line' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Rebill from date' })).toBeInTheDocument();
  });

  it('leave Rebill out on a running account', async () => {
    const view = buildBookView({ ...BOOK_VIEW.input, runningAccountFrom: '2026-08-01T00:00:00Z' });
    renderBook(<MinerDetail id={VARRO_ID} />, { ...BOOK_CONTEXT, view });
    await userEvent.click(screen.getAllByRole('button', { name: 'More actions' })[0]);
    expect(await screen.findByRole('menuitem', { name: /rate/i })).toBeInTheDocument();
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

  it('a Miner row opens to ore lines with one Open miner link and does not navigate', async () => {
    renderBook(<MoonDetail id={MOON_ID} />);
    expect(screen.queryByRole('link', { name: 'Open miner' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Varro Kestane'));
    const link = await screen.findByRole('link', { name: 'Open miner' });
    expect(link).toHaveAttribute('href', expect.stringContaining('/corp/moons/miners/'));
    expect(screen.getByRole('table', { name: /Ore mined by Varro Kestane/ })).toBeInTheDocument();
    // The clicked row already carries the totals.
    expect(screen.queryByText('Total')).not.toBeInTheDocument();
  });
});
