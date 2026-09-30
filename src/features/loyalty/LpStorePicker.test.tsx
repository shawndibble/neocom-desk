import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import '@/i18n';
import type { LpCorporationEntry } from '@/sde/marketTypes';

const CORPS: LpCorporationEntry[] = [
  { id: 1000120, name: 'Federation Navy', factionId: 500004 },
  { id: 1000130, name: 'Sisters of EVE' },
  { id: 1000125, name: 'CONCORD' },
  { id: 1000121, name: 'Federal Intelligence Office', factionId: 500004 },
];

vi.mock('@/sde/loadMarketSde', () => ({
  loadLpCorporations: () => Promise.resolve(CORPS),
}));

const loadCharacterLoyaltyPoints = vi.fn();
vi.mock('@/features/character/loyalty', () => ({
  loadCharacterLoyaltyPoints: (id: number) => loadCharacterLoyaltyPoints(id),
}));

const { LpStorePicker } = await import('./LpStorePicker');
const { useActiveCharacter } = await import('@/stores/activeCharacter');

function CurrentPath() {
  return <p data-testid="path">{useLocation().pathname}</p>;
}

function renderPicker(corporationName: string | null = null) {
  return render(
    <MemoryRouter initialEntries={['/wallet/loyalty']}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <LpStorePicker corporationName={corporationName} />
              <CurrentPath />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useActiveCharacter.setState({ activeCharacterId: 42, hydrated: true });
  loadCharacterLoyaltyPoints.mockResolvedValue({
    cached: {
      data: [{ corporation_id: 1000130, loyalty_points: 12_500 }],
      fetchedAt: new Date(),
      fromCache: false,
    },
    needsReauth: false,
  });
});

describe('LpStorePicker', () => {
  it('is a labelled combobox controlling a listbox', async () => {
    const user = userEvent.setup();
    renderPicker();
    const box = screen.getByRole('combobox', { name: 'LP Store corporation' });
    expect(box).toHaveAttribute('aria-expanded', 'false');
    await user.click(box);
    const listbox = await screen.findByRole('listbox');
    expect(box).toHaveAttribute('aria-expanded', 'true');
    expect(box).toHaveAttribute('aria-controls', listbox.id);
  });

  it('pins the corp the Character holds LP with first, showing its balance', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole('combobox'));
    const options = await screen.findAllByRole('option');
    expect(options[0]).toHaveTextContent('Sisters of EVE');
    expect(options[0]).toHaveTextContent('12,500 LP');
    expect(options.slice(1).map((o) => o.textContent)).toEqual([
      'CONCORD',
      'Federal Intelligence Office',
      'Federation Navy',
    ]);
  });

  it('filters by name as you type', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.type(screen.getByRole('combobox'), 'fed');
    await waitFor(() =>
      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
        'Federal Intelligence Office',
        'Federation Navy',
      ])
    );
  });

  it('opens the highlighted store on Enter, moving the highlight with the arrow keys', async () => {
    const user = userEvent.setup();
    renderPicker();
    const box = screen.getByRole('combobox');
    await user.type(box, 'fed');
    await screen.findAllByRole('option');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    const navy = screen.getByRole('option', { name: 'Federation Navy' });
    expect(navy).toHaveAttribute('aria-selected', 'true');
    expect(box).toHaveAttribute('aria-activedescendant', navy.id);
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('path')).toHaveTextContent('/wallet/loyalty/1000120');
  });

  it('wraps Home/End and closes on Escape', async () => {
    const user = userEvent.setup();
    renderPicker();
    const box = screen.getByRole('combobox');
    await user.click(box);
    await screen.findAllByRole('option');
    await user.keyboard('{End}');
    expect(screen.getByRole('option', { name: 'Federation Navy' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await user.keyboard('{Home}');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(box).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the best match on Enter with nothing highlighted', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.type(screen.getByRole('combobox'), 'navy');
    await screen.findByRole('option', { name: 'Federation Navy' });
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('path')).toHaveTextContent('/wallet/loyalty/1000120');
  });

  it('announces when nothing matches', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.type(screen.getByRole('combobox'), 'zzz');
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('No LP Store matches that name.')
    );
  });

  it("drops the previous Character's pinned corps when the Character is cleared", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByText('12,500 LP')).toBeInTheDocument();
    act(() => useActiveCharacter.setState({ activeCharacterId: null }));
    await waitFor(() => expect(screen.queryByText('12,500 LP')).not.toBeInTheDocument());
  });

  it('keeps the same corp highlighted when the balances land and re-pin the list', async () => {
    let resolveBalances: (value: unknown) => void = () => {};
    loadCharacterLoyaltyPoints.mockReturnValue(
      new Promise((resolve) => {
        resolveBalances = resolve;
      })
    );
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole('combobox'));
    await screen.findAllByRole('option');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: 'CONCORD' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await act(async () => {
      resolveBalances({
        cached: {
          data: [{ corporation_id: 1000130, loyalty_points: 12_500 }],
          fetchedAt: new Date(),
          fromCache: false,
        },
        needsReauth: false,
      });
    });
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Sisters of EVE');
    expect(screen.getByRole('option', { name: 'CONCORD' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('opens a store on click', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'CONCORD' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/wallet/loyalty/1000125');
  });

  it('shows the open store by name when not searching', () => {
    renderPicker('Sisters of EVE');
    expect(screen.getByRole('combobox')).toHaveValue('Sisters of EVE');
  });

  it('says so when nothing matches', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.type(screen.getByRole('combobox'), 'zzz');
    expect(
      await screen.findByText('No LP Store matches that name.', { selector: '[aria-hidden]' })
    ).toBeVisible();
  });

  it('still lists every store when the Character has no loyalty data', async () => {
    loadCharacterLoyaltyPoints.mockResolvedValue({ cached: null, needsReauth: false });
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole('combobox'));
    expect(await screen.findAllByRole('option')).toHaveLength(CORPS.length);
  });
});
