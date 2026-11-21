import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { resetHubStores } from '@/test/hubStores';
import { useMarketHub } from './hub';
import { HubField, HubMenu } from './HubMenu';
import { usePageHubs } from './pageHubs';
import { useClosestHubs } from './closestHub';

async function reset(pageHubs: Record<string, string>) {
  await db.settings.clear();
  await db.settings.bulkPut([
    { key: 'sync.marketHub', value: 'jita' },
    { key: 'sync.pageHubs', value: pageHubs },
  ]);
  resetHubStores();
  await Promise.all([usePageHubs.getState().hydrate(), useMarketHub.getState().hydrate()]);
}

function open() {
  render(
    <HubMenu area="contracts" triggerLabel="Hub">
      hub
    </HubMenu>
  );
  return userEvent.click(screen.getByRole('button', { name: 'Hub' }));
}

describe('HubMenu', () => {
  beforeEach(() => reset({}));

  it('on Global, marks Global and the Global hub, and a pick moves the Global hub', async () => {
    await open();
    expect(screen.getByRole('menuitemradio', { name: 'Global' })).toBeChecked();
    expect(screen.getByRole('menuitemradio', { name: 'Jita 4-4' })).toBeChecked();
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Amarr VIII' }));
    await waitFor(() => expect(useMarketHub.getState().value).toBe('amarr'));
    expect(usePageHubs.getState().value).toEqual({});
  });

  it('switching to the page keeps the menu open, and the next pick is the page’s own', async () => {
    await open();
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Contracts' }));
    await waitFor(() => expect(usePageHubs.getState().value).toEqual({ contracts: 'jita' }));
    expect(screen.getByRole('menuitemradio', { name: 'Contracts' })).toBeChecked();
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Hek VIII-12' }));
    await waitFor(() => expect(usePageHubs.getState().value).toEqual({ contracts: 'hek' }));
    expect(useMarketHub.getState().value).toBe('jita');
  });

  it('switching back to Global drops the page’s own hub', async () => {
    await reset({ contracts: 'rens' });
    await open();
    expect(screen.getByRole('menuitemradio', { name: 'Rens VI-8' })).toBeChecked();
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Global' }));
    await waitFor(() => expect(usePageHubs.getState().value).toEqual({}));
    expect(screen.getByRole('menuitemradio', { name: 'Jita 4-4' })).toBeChecked();
  });

  it('lists Closest first; on a page it shows the hub it found, and with no location the Global hub', async () => {
    await reset({ contracts: 'closest' });
    useActiveCharacter.setState({ activeCharacterId: 91, hydrated: true });
    useClosestHubs.setState({ byCharacter: { '91': { hubId: 'amarr', at: Date.now() } } });
    const { unmount } = render(<HubField area="contracts" label="Priced at" />);
    const field = await screen.findByRole('button', { name: 'Closest (Amarr), Priced at' });
    await userEvent.click(field);
    const hubs = within(screen.getByRole('group', { name: 'Trade Hub' })).getAllByRole(
      'menuitemradio'
    );
    expect(hubs[0]).toHaveAccessibleName('Closest hub');
    expect(hubs[0]).toBeChecked();
    unmount();

    useClosestHubs.setState({ byCharacter: { '91': { hubId: null, at: Date.now() } } });
    render(<HubField area="contracts" label="Priced at" />);
    expect(await screen.findByRole('button', { name: 'Jita, Priced at' })).toBeInTheDocument();
  });
});
