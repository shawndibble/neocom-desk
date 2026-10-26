import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
  it('is one scroll of sections with counts, no tabs, and the old panels stay reachable', async () => {
    renderBook(<MinerDetail id={VARRO_ID} />);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    for (const title of [
      /^Next Statement · 4/,
      /^Still accruing · 1/,
      /^Earlier days · 4/,
      /^Payments · 1/,
      /^Moons · 2/,
      /^Activity · 0/,
    ])
      expect(screen.getByText(title)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '2 characters' }));
    expect(await screen.findByRole('button', { name: 'Group with…' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Mail/ }));
    expect(screen.getByText('No entries.')).toBeInTheDocument();
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
  it('a Miner row opens to ore lines with one Open miner link and does not navigate', async () => {
    renderBook(<MoonDetail id={MOON_ID} />);
    expect(screen.queryByRole('link', { name: 'Open miner' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Varro Kestane'));
    const link = await screen.findByRole('link', { name: 'Open miner' });
    expect(link).toHaveAttribute('href', expect.stringContaining('/corp/moons/miners/'));
    expect(screen.getByRole('table', { name: /Ore mined by Varro Kestane/ })).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });
});
