import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
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

const NOTICE = BOOK_VIEW.input.notices.find((n) => n.minerId === VARRO_ID)!;

function Where() {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
}

const renderMiner = (path = '/corp/moons/miners/g1') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <BookProvider value={BOOK_CONTEXT}>
        <Where />
        <MinerDetail id={VARRO_ID} />
      </BookProvider>
    </MemoryRouter>
  );

describe('Miner page late notice links (#5288)', () => {
  it('names the late notice that listed a day, and opens its panel from it', async () => {
    renderMiner();
    const [link] = screen.getAllByRole('button', { name: /^Open the late notice of / });
    await userEvent.click(link!);
    expect(screen.getByTestId('search').textContent).toBe(
      `?notice=${encodeURIComponent(NOTICE.id)}`
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('opens the panel from ?notice= without the Open Miner page link, and Close replaces the URL', async () => {
    renderMiner(`/corp/moons/miners/g1?notice=${encodeURIComponent(NOTICE.id)}`);
    const panel = await screen.findByRole('dialog');
    expect(within(panel).queryByRole('link', { name: 'Open Miner page' })).toBeNull();
    await userEvent.click(within(panel).getByRole('button', { name: /close/i }));
    expect(screen.getByTestId('search').textContent).toBe('');
  });

  it('still opens the panel from an old ?statement= link', async () => {
    renderMiner(`/corp/moons/miners/g1?statement=${encodeURIComponent(NOTICE.id)}`);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it("a ?notice= that is not this Miner's says so and drops the param", async () => {
    renderMiner('/corp/moons/miners/g1?notice=nope');
    expect(await screen.findByText('Late notice not found.')).toBeInTheDocument();
    expect(screen.getByTestId('search').textContent).toBe('');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
