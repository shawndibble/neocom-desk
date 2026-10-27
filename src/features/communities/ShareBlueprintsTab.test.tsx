import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import en from '@/i18n/locales/en.json';
import { db } from '@/db';

const publish = vi.hoisted(() => vi.fn());
vi.mock('./libraryPush', () => ({ publishSharedLibrary: publish }));
vi.mock('./useOwnedBlueprintTypes', () => ({
  useOwnedBlueprintTypes: () => ({
    status: 'ready',
    groups: [],
    owned: [
      { typeId: 10, name: 'Alpha Blueprint', marketGroupId: null },
      { typeId: 20, name: 'Beta Blueprint', marketGroupId: null },
      { typeId: 30, name: 'Gamma Blueprint', marketGroupId: null },
    ],
  }),
}));

const READY = {
  status: 'ready',
  copies: [
    { typeId: 10, placeId: 500 },
    { typeId: 10, placeId: 700 },
    { typeId: 20, placeId: 500 },
    { typeId: 30, placeId: 600 },
  ],
};
const copies = vi.hoisted(() => ({ current: {} as unknown }));
vi.mock('./useBlueprintPlaces', () => ({
  useBlueprintCopies: () => copies.current,
  usePlaceLabels: () =>
    new Map([
      [500, { name: 'Jita IV - Moon 4', systemName: 'Jita' }],
      [600, { name: null, systemName: null }],
      [700, { name: 'Amarr VIII', systemName: 'Amarr' }],
    ]),
}));

import {
  loadBlueprintShare,
  loadShareChoice,
  saveBlueprintShare,
  saveShareChoice,
} from './shareSelection';
import { ShareBlueprintsTab } from './ShareBlueprintsTab';

const b = en.communities.blueprints;

function renderTab() {
  render(
    <MemoryRouter>
      <ShareBlueprintsTab characterId={1} communityId="c1" />
    </MemoryRouter>
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  copies.current = READY;
  publish.mockResolvedValue({ outcome: 'full', skipped: 0 });
  await db.settings.clear();
});

describe('ShareBlueprintsTab', () => {
  it('lists nothing and shares nothing until a choice is made', async () => {
    renderTab();
    expect(await screen.findByText(b.noneShared)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: b.shareAll })).not.toBeChecked();
  });

  it('shares all, lists every blueprint, and publishes', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByRole('checkbox', { name: b.shareAll }));
    expect(await screen.findByText('Alpha Blueprint')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: b.stop })).toHaveLength(3);
    expect(await loadShareChoice(1, 'c1')).toEqual({ all: true, excluded: new Set() });
    expect(publish).toHaveBeenCalledWith(1, 'c1');
  });

  it('stops sharing one blueprint under share-all as an exclusion', async () => {
    await saveShareChoice(1, 'c1', { all: true, excluded: new Set() });
    const user = userEvent.setup();
    renderTab();
    const row = (await screen.findByText('Beta Blueprint')).closest('li')!;
    await user.click(within(row).getByRole('button', { name: b.stop }));
    await waitFor(() => expect(screen.queryByText('Beta Blueprint')).not.toBeInTheDocument());
    expect(await loadShareChoice(1, 'c1')).toEqual({ all: true, excluded: new Set([20]) });
  });

  async function openAdd(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: b.add }));
    return screen.findByRole('dialog', { name: b.addTitle });
  }

  it('adds one blueprint from the Add blueprints dialog', async () => {
    const user = userEvent.setup();
    renderTab();
    const dialog = await openAdd(user);
    await user.click(within(dialog).getByRole('button', { name: b.tabBlueprints }));
    await user.type(within(dialog).getByRole('searchbox'), 'gamma');
    const row = within(dialog).getByText('Gamma Blueprint').closest('li')!;
    await user.click(within(row).getByRole('button', { name: b.share }));
    await waitFor(async () =>
      expect(await loadShareChoice(1, 'c1')).toEqual({ all: false, allowed: new Set([30]) })
    );
  });

  it('shares every blueprint at a location as a standing rule', async () => {
    const user = userEvent.setup();
    renderTab();
    const dialog = await openAdd(user);
    const row = within(dialog).getByText('Jita IV - Moon 4').closest('li')!;
    expect(row).toHaveTextContent('Jita · 2 blueprints');
    await user.click(within(row).getByRole('button', { name: b.share }));
    await waitFor(async () =>
      expect((await loadBlueprintShare(1, 'c1')).locations).toEqual(new Set([500]))
    );
    expect(await loadShareChoice(1, 'c1')).toEqual({ all: false, allowed: new Set() });
    expect(publish).toHaveBeenCalledWith(1, 'c1');
  });

  it('names a structure it cannot read with a fallback', async () => {
    const user = userEvent.setup();
    renderTab();
    const dialog = await openAdd(user);
    expect(within(dialog).getByText(b.unknownLocation)).toBeInTheDocument();
  });

  it('lists a blueprint shared through a location with where, and no Stop sharing', async () => {
    await saveBlueprintShare(1, 'c1', {
      choice: { all: false, allowed: new Set([30]) },
      locations: new Set([500]),
    });
    renderTab();
    const via = (await screen.findByText('Alpha Blueprint')).closest('li')!;
    expect(via).toHaveTextContent('via Jita IV - Moon 4');
    expect(within(via).queryByRole('button')).not.toBeInTheDocument();
    const direct = screen.getByText('Gamma Blueprint').closest('li')!;
    expect(within(direct).getByRole('button', { name: b.stop })).toBeInTheDocument();
    // The location's own row is where it stops.
    const locations = screen.getByRole('region', { name: b.sharedLocations });
    expect(within(locations).getByText('Jita IV - Moon 4')).toBeInTheDocument();
  });

  it('stops a shared location from its row, and its blueprints go with it', async () => {
    await saveBlueprintShare(1, 'c1', {
      choice: { all: false, allowed: new Set() },
      locations: new Set([500]),
    });
    const user = userEvent.setup();
    renderTab();
    const locations = await screen.findByRole('region', { name: b.sharedLocations });
    await user.click(within(locations).getByRole('button', { name: b.stop }));
    await waitFor(() => expect(screen.queryByText('Alpha Blueprint')).not.toBeInTheDocument());
    expect((await loadBlueprintShare(1, 'c1')).locations).toEqual(new Set());
  });

  it('still offers a blueprint partly covered by a location, to share its other copies', async () => {
    await saveBlueprintShare(1, 'c1', {
      choice: { all: false, allowed: new Set() },
      locations: new Set([500]),
    });
    const user = userEvent.setup();
    renderTab();
    const dialog = await openAdd(user);
    await user.click(within(dialog).getByRole('button', { name: b.tabBlueprints }));
    const row = within(dialog).getByText('Alpha Blueprint').closest('li')!;
    expect(row).toHaveTextContent('via Jita IV - Moon 4');
    expect(within(row).getByRole('button', { name: b.share })).toBeInTheDocument();
  });

  it('under share-all, offers only the stopped blueprints and no locations', async () => {
    await saveShareChoice(1, 'c1', { all: true, excluded: new Set([20]) });
    const user = userEvent.setup();
    renderTab();
    const dialog = await openAdd(user);
    expect(within(dialog).queryByRole('button', { name: b.tabLocations })).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Alpha Blueprint')).not.toBeInTheDocument();
    const row = within(dialog).getByText('Beta Blueprint').closest('li')!;
    await user.click(within(row).getByRole('button', { name: b.share }));
    await waitFor(async () =>
      expect(await loadShareChoice(1, 'c1')).toEqual({ all: true, excluded: new Set() })
    );
  });

  it('asks before turning share-all off, then shares nothing', async () => {
    await saveShareChoice(1, 'c1', { all: true, excluded: new Set() });
    await db.settings.put({ key: 'communityShare:1:c1:locations', value: [500] });
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByRole('checkbox', { name: b.shareAll }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: b.offAction }));
    await waitFor(async () =>
      expect(await loadBlueprintShare(1, 'c1')).toEqual({
        choice: { all: false, allowed: new Set() },
        locations: new Set(),
      })
    );
  });

  it('waits for the places before listing, so a location-only share never flashes as none', async () => {
    copies.current = { status: 'loading' };
    await saveBlueprintShare(1, 'c1', {
      choice: { all: false, allowed: new Set() },
      locations: new Set([500]),
    });
    renderTab();
    expect(
      await screen.findByRole('status', { name: en.communities.share.loading })
    ).toBeInTheDocument();
    expect(screen.queryByText(b.noneShared)).not.toBeInTheDocument();
  });

  it('says locations need assets instead of offering a Share that does nothing', async () => {
    copies.current = { status: 'unavailable' };
    const user = userEvent.setup();
    renderTab();
    const dialog = await openAdd(user);
    expect(within(dialog).getByText(b.locationsNeedAssets)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: b.share })).not.toBeInTheDocument();
  });

  it('names the first of several locations and the rest in a tooltip', async () => {
    await saveBlueprintShare(1, 'c1', {
      choice: { all: false, allowed: new Set() },
      locations: new Set([500, 700]),
    });
    renderTab();
    const row = (await screen.findByText('Alpha Blueprint')).closest('li')!;
    expect(row).toHaveTextContent('via Jita IV - Moon 4 +1 more');
  });

  it('moves focus to the next Stop sharing when a row goes', async () => {
    await saveShareChoice(1, 'c1', { all: false, allowed: new Set([10, 20]) });
    const user = userEvent.setup();
    renderTab();
    const alpha = (await screen.findByText('Alpha Blueprint')).closest('li')!;
    await user.click(within(alpha).getByRole('button', { name: b.stop }));
    const beta = screen.getByText('Beta Blueprint').closest('li')!;
    await waitFor(() => expect(within(beta).getByRole('button', { name: b.stop })).toHaveFocus());
  });

  it('moves focus to the next blueprint in the dialog when one is shared', async () => {
    const user = userEvent.setup();
    renderTab();
    const dialog = await openAdd(user);
    await user.click(within(dialog).getByRole('button', { name: b.tabBlueprints }));
    const alpha = within(dialog).getByText('Alpha Blueprint').closest('li')!;
    await user.click(within(alpha).getByRole('button', { name: b.share }));
    const beta = within(dialog).getByText('Beta Blueprint').closest('li')!;
    await waitFor(() => expect(within(beta).getByRole('button', { name: b.share })).toHaveFocus());
  });

  it('checks the Community on open when only a location is shared', async () => {
    await saveBlueprintShare(1, 'c1', {
      choice: { all: false, allowed: new Set() },
      locations: new Set([500]),
    });
    renderTab();
    await waitFor(() => expect(publish).toHaveBeenCalledWith(1, 'c1'));
  });

  it('says so when a change could not be published', async () => {
    publish.mockResolvedValue({ outcome: 'unavailable', skipped: 0 });
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByRole('checkbox', { name: b.shareAll }));
    expect(await screen.findByText(b.unpublished)).toBeInTheDocument();
  });

  it('runs two quick changes one after the other, each from the one before', async () => {
    await saveShareChoice(1, 'c1', { all: true, excluded: new Set() });
    const user = userEvent.setup();
    renderTab();
    const rows = await screen.findAllByRole('button', { name: b.stop });
    await user.click(rows[0]!);
    await user.click(screen.getAllByRole('button', { name: b.stop })[0]!);
    await waitFor(async () =>
      expect(await loadShareChoice(1, 'c1')).toEqual({ all: true, excluded: new Set([10, 20]) })
    );
  });

  it('says how many blueprints were left out for want of a known place', async () => {
    await saveShareChoice(1, 'c1', { all: true, excluded: new Set() });
    publish.mockResolvedValue({ outcome: 'full', skipped: 2 });
    renderTab();
    expect(await screen.findByText(/2 blueprints are not shared/)).toBeInTheDocument();
  });

  it('does not check the Community on open when nothing is shared', async () => {
    renderTab();
    await screen.findByText(b.noneShared);
    expect(publish).not.toHaveBeenCalled();
  });

  it('shows only the newest publish result when two overlap', async () => {
    const results: ((value: unknown) => void)[] = [];
    await saveShareChoice(1, 'c1', { all: true, excluded: new Set() });
    publish.mockImplementation(() => new Promise((resolve) => results.push(resolve)));
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => expect(results).toHaveLength(1));
    const row = (await screen.findByText('Beta Blueprint')).closest('li')!;
    await user.click(within(row).getByRole('button', { name: b.stop }));
    await waitFor(() => expect(results).toHaveLength(2));
    results[1]!({ outcome: 'full', skipped: 3 });
    results[0]!({ outcome: 'full', skipped: 9 });
    expect(await screen.findByText(/3 blueprints are not shared/)).toBeInTheDocument();
    expect(screen.queryByText(/9 blueprints are not shared/)).not.toBeInTheDocument();
  });
});
