import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { DropdownMenu, DropdownMenuContent } from '@/components/ui';
import { TrendHubsMenuGroup, TrendItemsDialog } from './TrendPicks';
import type { Widget } from './layout';

const setTrendItems = vi.fn();
const setTrendHubs = vi.fn();
vi.mock('./editContext', () => ({ useOverviewEdit: () => ({ setTrendItems, setTrendHubs }) }));
vi.mock('@/stores/activeCharacter', () => ({
  useActiveCharacter: (select: (s: { activeCharacterId: number }) => unknown) =>
    select({ activeCharacterId: 91 }),
}));
vi.mock('@/features/market/useQuickbar', () => ({
  useQuickbar: () => ({
    items: [
      { typeId: 34, name: 'Tritanium' },
      { typeId: 35, name: 'Pyerite' },
    ],
  }),
}));
vi.mock('@/features/market/hub', () => ({
  useMarketHub: (select: (s: { value: string }) => unknown) => select({ value: 'jita' }),
}));
vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketGroups: async () => [{ id: 1857, name: 'Minerals', parentId: 533, hasTypes: true }],
  loadMarketTypes: async () => [
    { typeId: 36, name: 'Mexallon', marketGroupId: 1857, volume: 1 },
    { typeId: 44992, name: 'PLEX', marketGroupId: 1923, volume: 1 },
  ],
}));

const widget = (extra: Partial<Widget> = {}): Widget => ({
  id: 'a',
  kind: 'marketTrend',
  size: 'M',
  view: 'chart',
  scope: 'header',
  showOnPhone: true,
  ...extra,
});

beforeEach(() => {
  setTrendItems.mockReset();
  setTrendHubs.mockReset();
});

describe('TrendItemsDialog', () => {
  const open = (w = widget()) =>
    render(<TrendItemsDialog widget={w} title="Market Trend" open onClose={() => undefined} />);

  it('starts from the Quickbar the widget currently follows and saves the picks', async () => {
    const user = userEvent.setup();
    open();
    expect(screen.getByRole('checkbox', { name: 'Tritanium' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Pyerite' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(setTrendItems).toHaveBeenCalledWith('a', [34]);
  });

  it('adds minerals from the catalogue and keeps the Quickbar picks', async () => {
    const user = userEvent.setup();
    open();
    await user.selectOptions(screen.getByRole('combobox'), 'minerals');
    await user.click(await screen.findByRole('checkbox', { name: 'Mexallon' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(setTrendItems).toHaveBeenCalledWith('a', [34, 35, 36]);
  });

  it('stops at six picks', async () => {
    open(widget({ trendItems: [1, 2, 3, 4, 5, 6] }));
    expect(screen.getByRole('checkbox', { name: 'Tritanium' })).toBeDisabled();
    expect(screen.getByText(/6 of 6 chosen/)).toBeInTheDocument();
  });

  it('goes back to following the Quickbar', async () => {
    const user = userEvent.setup();
    open(widget({ trendItems: [36] }));
    await user.click(screen.getByRole('button', { name: 'Follow my Quickbar' }));
    expect(setTrendItems).toHaveBeenCalledWith('a', []);
  });
});

describe('TrendHubsMenuGroup', () => {
  const open = (w = widget()) =>
    render(
      <DropdownMenu open>
        <DropdownMenuContent>
          <TrendHubsMenuGroup widget={w} />
        </DropdownMenuContent>
      </DropdownMenu>
    );

  it('ticks the pilot hub by default and cannot untick the last hub', () => {
    open();
    expect(screen.getByRole('menuitemcheckbox', { name: 'Jita' })).toBeChecked();
    expect(screen.getByRole('menuitemcheckbox', { name: 'Jita' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('adds a hub', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Amarr' }));
    await waitFor(() => expect(setTrendHubs).toHaveBeenCalledWith('a', ['jita', 'amarr']));
  });

  it('stores nothing when the pick is back to the pilot hub alone', async () => {
    const user = userEvent.setup();
    open(widget({ trendHubs: ['jita', 'amarr'] }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Amarr' }));
    await waitFor(() => expect(setTrendHubs).toHaveBeenCalledWith('a', []));
  });

  it('offers no fourth hub', () => {
    open(widget({ trendHubs: ['jita', 'amarr', 'rens'] }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Dodixie' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });
});
