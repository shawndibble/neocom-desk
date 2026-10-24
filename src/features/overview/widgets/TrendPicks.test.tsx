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
vi.mock('@/features/market/orderBookView', () => ({
  useGlobalMarketOverrides: () => new Map([[44992, { regionId: 1, regionName: 'Global' }]]),
}));
const sde = vi.hoisted(() => ({ failNext: false }));
vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketGroups: async () => {
    if (sde.failNext) {
      sde.failNext = false;
      throw new Error('offline');
    }
    return [{ id: 1857, name: 'Minerals', parentId: 533, hasTypes: true }];
  },
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

  it('lists a pick only under Selected, and a removed pick returns to its list', async () => {
    const user = userEvent.setup();
    open();
    expect(screen.queryByRole('button', { name: 'Add Tritanium' })).not.toBeInTheDocument();
    expect(screen.getByText('Selected (2 of 6)')).toBeInTheDocument();
    expect(screen.getByText('Everything in this list is already selected.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove Pyerite' }));
    expect(screen.getByRole('button', { name: 'Add Pyerite' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(setTrendItems).toHaveBeenCalledWith('a', [34]);
  });

  it('moves an added item from its list to Selected, with a highlight, and keeps focus in the list', async () => {
    const user = userEvent.setup();
    open(widget({ trendItems: [] }));
    await user.click(screen.getByRole('button', { name: 'Add Tritanium' }));
    expect(screen.queryByRole('button', { name: 'Add Tritanium' })).not.toBeInTheDocument();
    const added = screen.getByRole('button', { name: 'Remove Tritanium' }).closest('li')!;
    expect(added.className).toContain('row-pulse');
    expect(screen.getByRole('button', { name: 'Add Pyerite' })).toHaveFocus();
  });

  it('adds minerals from the catalogue and keeps the Quickbar picks', async () => {
    const user = userEvent.setup();
    open();
    await user.selectOptions(screen.getByRole('combobox'), 'minerals');
    await user.click(await screen.findByRole('button', { name: 'Add Mexallon' }));
    expect(screen.queryByRole('button', { name: 'Add Mexallon' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(setTrendItems).toHaveBeenCalledWith('a', [34, 35, 36]);
  });

  it('stops at six picks', async () => {
    open(widget({ trendItems: [1, 2, 3, 4, 5, 6] }));
    expect(screen.getByRole('button', { name: 'Add Tritanium' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add Tritanium' })).toHaveAccessibleDescription(
      /Remove one to add another/
    );
    expect(screen.getByText('Selected (6 of 6)')).toBeInTheDocument();
  });

  it('searches every list at once and shows which list each hit is from', async () => {
    const user = userEvent.setup();
    open();
    await user.type(screen.getByRole('searchbox', { name: 'Search items' }), 'mex');
    expect(await screen.findByRole('button', { name: /Add Mexallon/ })).toBeInTheDocument();
    expect(screen.getByText('Minerals')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Add Mexallon/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(setTrendItems).toHaveBeenCalledWith('a', [34, 35, 36]);
  });

  it('says so when nothing matches, and clearing the search brings the list back', async () => {
    const user = userEvent.setup();
    open();
    const box = screen.getByRole('searchbox', { name: 'Search items' });
    await user.type(box, 'zzz');
    expect(await screen.findByText('No item matches that name.')).toBeInTheDocument();
    await user.clear(box);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('does not save and close when Enter is pressed in the search box', async () => {
    const user = userEvent.setup();
    render(
      <TrendItemsDialog widget={widget()} title="Market Trend" open onClose={() => undefined} />
    );
    await user.type(screen.getByRole('searchbox'), 'mex{Enter}');
    expect(setTrendItems).not.toHaveBeenCalled();
  });

  it('names a stored pick that is not in the Quickbar as soon as it opens', async () => {
    render(
      <TrendItemsDialog
        widget={widget({ trendItems: [36] })}
        title="Market Trend"
        open
        onClose={() => undefined}
      />
    );
    expect(await screen.findByRole('button', { name: 'Remove Mexallon' })).toBeInTheDocument();
  });

  it('removes a pick from the selected list whatever list is showing', async () => {
    const user = userEvent.setup();
    open();
    expect(screen.getByText('Selected (2 of 6)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove Pyerite' }));
    expect(screen.getByText('Selected (1 of 6)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(setTrendItems).toHaveBeenCalledWith('a', [34]);
  });

  it('lists every ore source in the dropdown', async () => {
    open();
    const labels = screen.getAllByRole('option').map((o) => o.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Compressed ore', 'Ice ore', 'Moon ore']));
  });

  it('warns when the picks make more lines than the chart draws', () => {
    open(widget({ trendItems: [34, 35, 36, 37], trendHubs: ['jita', 'amarr', 'rens'] }));
    expect(screen.getByRole('alert')).toHaveTextContent(/12 lines but the chart draws 6/);
    expect(screen.getByRole('alert')).toHaveTextContent(/Not drawn: #36, #37/);
  });

  it('counts PLEX once whatever the hubs', () => {
    open(widget({ trendItems: [44992, 34], trendHubs: ['jita', 'amarr'] }));
    expect(screen.getByText(/draw 3 lines/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('closes without storing when a Quickbar-following widget is saved unchanged', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TrendItemsDialog widget={widget()} title="Market Trend" open onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(setTrendItems).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('retries a failed catalogue load', async () => {
    const user = userEvent.setup();
    sde.failNext = true;
    open();
    await user.selectOptions(screen.getByRole('combobox'), 'minerals');
    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Add Mexallon' })).toBeInTheDocument();
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
