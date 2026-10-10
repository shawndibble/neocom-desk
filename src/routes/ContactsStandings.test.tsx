import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { ContactsStandings } from './ContactsStandings';

const loadMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/character/standings', () => ({ loadCharacterStandingsResult: loadMock }));
vi.mock('@/features/character/names', () => ({
  resolveNames: vi.fn(async () => new Map([[500001, 'Caldari Navy']])),
}));
vi.mock('@/app/useGrantedScopes', () => ({ useCharacterLacksEndpoints: () => false }));

const ENTRY = { from_id: 500001, from_type: 'faction', standing: 3.5 };

function renderTab() {
  return render(
    <MemoryRouter>
      <ContactsStandings characterId={91} tabBar={<div>tab strip</div>} tabsId="t" />
    </MemoryRouter>
  );
}

beforeEach(() => {
  loadMock.mockReset();
});

describe('ContactsStandings header', () => {
  it('shows the data-age chip and a Refresh button once standings load', async () => {
    loadMock.mockResolvedValue({ entries: [ENTRY], fetchedAt: new Date() });
    renderTab();

    expect(await screen.findByText('Caldari Navy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    expect(screen.getByText(/just now|ago/i)).toBeInTheDocument();
    expect(loadMock).toHaveBeenCalledWith(91, { force: false });
  });

  it('Refresh forces a live fetch and re-renders the rows', async () => {
    loadMock.mockResolvedValueOnce({ entries: [ENTRY], fetchedAt: new Date() });
    renderTab();
    await screen.findByText('Caldari Navy');

    loadMock.mockResolvedValueOnce({
      entries: [{ ...ENTRY, standing: -2 }],
      fetchedAt: new Date(),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(loadMock).toHaveBeenLastCalledWith(91, { force: true }));
    expect(await screen.findByText('-2.00')).toBeInTheDocument();
  });

  it('has no chip when there is no data', async () => {
    loadMock.mockResolvedValue({ entries: [], fetchedAt: null });
    renderTab();

    expect(await screen.findByText('No NPC standings yet')).toBeInTheDocument();
    expect(screen.queryByText(/just now|ago/i)).toBeNull();
  });
});
