import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { useContactsStandings } from './ContactsStandings';

const loadMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/character/standings', () => ({ loadCharacterStandingsResult: loadMock }));
vi.mock('@/features/character/names', () => ({
  resolveNames: vi.fn(async () => new Map([[500001, 'Caldari Navy']])),
}));
vi.mock('@/app/useGrantedScopes', () => ({ useCharacterLacksEndpoints: () => false }));

const ENTRY = { from_id: 500001, from_type: 'faction', standing: 3.5 };

/** The page's header, as `Contacts` lays it out around the hook's parts. */
function StandingsHarness({ characterId }: { characterId: number }) {
  const { meta, actions, content } = useContactsStandings(characterId, true);
  return (
    <>
      <div>{meta}</div>
      <div>{actions}</div>
      <div>tab strip</div>
      {content}
    </>
  );
}

function renderTab() {
  return render(
    <MemoryRouter>
      <StandingsHarness characterId={91} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  loadMock.mockReset();
});

describe('ContactsStandings header', () => {
  it('shows the data-age chip and a Refresh button once standings load', async () => {
    loadMock.mockResolvedValue({
      entries: [ENTRY],
      fetchedAt: new Date(),
      fromCache: false,
      available: true,
    });
    renderTab();

    expect(await screen.findByText('Caldari Navy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    expect(screen.getByText(/just now|ago/i)).toBeInTheDocument();
    expect(loadMock).toHaveBeenCalledWith(91, { force: false });
  });

  it('Refresh forces a live fetch and re-renders the rows', async () => {
    loadMock.mockResolvedValueOnce({
      entries: [ENTRY],
      fetchedAt: new Date(),
      fromCache: false,
      available: true,
    });
    renderTab();
    await screen.findByText('Caldari Navy');

    loadMock.mockResolvedValueOnce({
      entries: [{ ...ENTRY, standing: -2 }],
      fetchedAt: new Date(),
      fromCache: false,
      available: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(loadMock).toHaveBeenLastCalledWith(91, { force: true }));
    expect(await screen.findByText('-2.00')).toBeInTheDocument();
  });

  it('has no chip when there is no data', async () => {
    loadMock.mockResolvedValue({ entries: [], fetchedAt: null, fromCache: false, available: true });
    renderTab();

    expect(await screen.findByText('No NPC standings yet')).toBeInTheDocument();
    expect(screen.queryByText(/just now|ago/i)).toBeNull();
  });

  it('says it could not load, not "No NPC standings yet", when nothing was loaded', async () => {
    loadMock.mockResolvedValueOnce({
      entries: [],
      fetchedAt: null,
      fromCache: false,
      available: false,
    });
    renderTab();

    expect(await screen.findAllByText("Couldn't load")).not.toHaveLength(0);
    expect(screen.queryByText('No NPC standings yet')).toBeNull();

    loadMock.mockResolvedValueOnce({
      entries: [ENTRY],
      fetchedAt: new Date(),
      fromCache: false,
      available: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Caldari Navy')).toBeInTheDocument();
  });

  it('labels rows served from cache', async () => {
    loadMock.mockResolvedValue({
      entries: [ENTRY],
      fetchedAt: new Date(),
      fromCache: true,
      available: true,
    });
    renderTab();

    expect(await screen.findByText('Caldari Navy')).toBeInTheDocument();
    expect(screen.getByText('Showing cached data')).toBeInTheDocument();
  });

  it('keeps the rows on screen while Refresh is in flight', async () => {
    loadMock.mockResolvedValueOnce({
      entries: [ENTRY],
      fetchedAt: new Date(),
      fromCache: false,
      available: true,
    });
    renderTab();
    await screen.findByText('Caldari Navy');

    let finish: (value: unknown) => void = () => {};
    loadMock.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled());
    expect(screen.getByText('Caldari Navy')).toBeInTheDocument();
    finish({ entries: [ENTRY], fetchedAt: new Date(), fromCache: true, available: true });
    expect(await screen.findByText('Showing cached data')).toBeInTheDocument();
  });
});
