import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useHubByCharacter } from './characterHubs';
import { useDefaultMarketHub, useMarketHub } from './hub';
import { HubMenu } from './HubMenu';
import { usePageHubs } from './pageHubs';

async function reset(pageHubs: Record<string, string>) {
  await db.settings.clear();
  await db.settings.bulkPut([
    { key: 'sync.marketHub', value: 'jita' },
    { key: 'sync.pageHubs', value: pageHubs },
  ]);
  useDefaultMarketHub.setState({ value: 'jita', hydrated: false });
  useHubByCharacter.setState({ value: {}, hydrated: false });
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  useMarketHub.setState({ value: 'jita', hydrated: false });
  usePageHubs.setState({ value: {}, hydrated: false });
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
});
