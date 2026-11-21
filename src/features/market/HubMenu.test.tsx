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
import { usePagePricePercents } from './pagePricePercents';
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

const settings = () => screen.getByRole('group', { name: 'Market hub settings' });
const hubs = () => screen.getByRole('group', { name: 'Market hub' });

describe('HubMenu', () => {
  beforeEach(() => reset({}));

  it('on App setting, marks it and the Global hub, and a pick moves the Global hub and closes', async () => {
    await open();
    expect(within(settings()).getByRole('button', { name: 'App setting' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(within(hubs()).getByRole('button', { name: 'Jita 4-4' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await userEvent.click(within(hubs()).getByRole('button', { name: 'Amarr VIII' }));
    await waitFor(() => expect(useMarketHub.getState().value).toBe('amarr'));
    expect(usePageHubs.getState().value).toEqual({});
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Market hub' })).not.toBeInTheDocument()
    );
  });

  it('switching to the page keeps it open, and the next pick is the page’s own', async () => {
    await open();
    await userEvent.click(within(settings()).getByRole('button', { name: 'Contracts' }));
    await waitFor(() => expect(usePageHubs.getState().value).toEqual({ contracts: 'jita' }));
    expect(within(settings()).getByRole('button', { name: 'Contracts' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await userEvent.click(within(hubs()).getByRole('button', { name: 'Hek VIII-12' }));
    await waitFor(() => expect(usePageHubs.getState().value).toEqual({ contracts: 'hek' }));
    expect(useMarketHub.getState().value).toBe('jita');
  });

  it('switching back to App setting drops the page’s own hub', async () => {
    await reset({ contracts: 'rens' });
    await open();
    expect(within(hubs()).getByRole('button', { name: 'Rens VI-8' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await userEvent.click(within(settings()).getByRole('button', { name: 'App setting' }));
    await waitFor(() => expect(usePageHubs.getState().value).toEqual({}));
    expect(within(hubs()).getByRole('button', { name: 'Jita 4-4' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('has no percent field unless the page says which side it prices', async () => {
    await open();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('lists Closest first; on a page it shows the hub it found, and with no location the Global hub', async () => {
    await reset({ contracts: 'closest' });
    useActiveCharacter.setState({ activeCharacterId: 91, hydrated: true });
    useClosestHubs.setState({ byCharacter: { '91': { hubId: 'amarr', at: Date.now() } } });
    const { unmount } = render(<HubField area="contracts" label="Priced at" />);
    const field = await screen.findByRole('button', { name: 'Closest (Amarr), Priced at' });
    await userEvent.click(field);
    const buttons = within(hubs()).getAllByRole('button');
    expect(buttons[0]).toHaveAccessibleName('Closest hub');
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    unmount();

    useClosestHubs.setState({ byCharacter: { '91': { hubId: null, at: Date.now() } } });
    render(<HubField area="contracts" label="Priced at" />);
    expect(await screen.findByRole('button', { name: 'Jita, Priced at' })).toBeInTheDocument();
  });
});

describe('HubField percent', () => {
  beforeEach(() => reset({}));

  it('names the field by side, writes the page’s percent as typed, and shows it on the trigger', async () => {
    const user = userEvent.setup();
    render(<HubField area="fittings" side="buy" label="Priced at" />);
    await user.click(await screen.findByRole('button', { name: 'Jita, Priced at' }));
    const box = screen.getByRole('spinbutton', { name: 'Buy percent' });
    expect(box).toHaveValue(100);
    await user.clear(box);
    await user.type(box, '90');
    await waitFor(() => expect(usePagePricePercents.getState().value).toEqual({ fittings: 90 }));
    // The percent belongs to the page: the Global hub is untouched.
    expect(useMarketHub.getState().value).toBe('jita');
    expect(screen.getByRole('button', { name: 'Jita · 90%, Priced at' })).toBeInTheDocument();
  });

  it('labels a selling page Sell percent', async () => {
    render(<HubField area="mining" side="sell" label="Priced at" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Jita, Priced at' }));
    expect(screen.getByRole('spinbutton', { name: 'Sell percent' })).toBeInTheDocument();
  });

  it('offers no percent on a page that has none, side or not', async () => {
    render(<HubField area="market" side="sell" label="Priced at" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Jita, Priced at' }));
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });
});
