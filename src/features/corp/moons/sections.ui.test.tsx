import { describe, expect, it, vi } from 'vitest';
import { readAudit } from '../taxBook/bookClient';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { BookProvider } from './BookContext';
import { BOOK_CONTEXT, MOON_ID, VARRO_ID } from './corpBookFixture';
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

function renderBook(ui: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/corp/moons']}>
      <BookProvider value={BOOK_CONTEXT}>{ui}</BookProvider>
    </MemoryRouter>
  );
}

describe('Overview', () => {
  it('orders Fractured, Ready, then moons popping in the next 7 days', () => {
    renderBook(<OverviewTab showMoons />);
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
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
      /^Moons · 2/,
      /^Activity · 0/,
    ])
      expect(screen.getByText(title)).toBeInTheDocument();
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

  it('sorts the Payments ledger by When, From, Amount and Credited to', () => {
    renderBook(<MinerDetail id={VARRO_ID} />);
    const payments = screen.getByRole('table', { name: 'Payments' });
    for (const name of [/^When/, /^From/, /^Amount/, /^Credited to/])
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
    await waitFor(() => expect(screen.getByText(/mailed a Statement/)).toBeInTheDocument());
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

describe('Corrections menu', () => {
  it('opens on the Payments section and lists the three corrections', async () => {
    renderBook(<MinerDetail id={VARRO_ID} />);
    await userEvent.click(screen.getByRole('button', { name: 'Corrections' }));
    expect(await screen.findByRole('menuitem', { name: /rate/i })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
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
