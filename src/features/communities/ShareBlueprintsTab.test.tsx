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

import { loadShareChoice, saveShareChoice } from './shareSelection';
import { ShareBlueprintsTab } from './ShareBlueprintsTab';

const b = en.communities.blueprints;

function renderTab() {
  const onOpenLibrary = vi.fn();
  render(
    <MemoryRouter>
      <ShareBlueprintsTab characterId={1} communityId="c1" onOpenLibrary={onOpenLibrary} />
    </MemoryRouter>
  );
  return { onOpenLibrary };
}

beforeEach(async () => {
  vi.clearAllMocks();
  publish.mockResolvedValue('full');
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

  it('adds a blueprint from the search when not sharing all', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.type(await screen.findByRole('searchbox'), 'gamma');
    const row = (await screen.findByText('Gamma Blueprint')).closest('li')!;
    await user.click(within(row).getByRole('button', { name: b.share }));
    expect(await loadShareChoice(1, 'c1')).toEqual({ all: false, allowed: new Set([30]) });
  });

  it('asks before turning share-all off, then shares nothing', async () => {
    await saveShareChoice(1, 'c1', { all: true, excluded: new Set() });
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByRole('checkbox', { name: b.shareAll }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: b.offAction }));
    await waitFor(async () =>
      expect(await loadShareChoice(1, 'c1')).toEqual({ all: false, allowed: new Set() })
    );
  });

  it('says so when a change could not be published', async () => {
    publish.mockResolvedValue('unavailable');
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

  it('links to BPC Sourcing narrowed to the Community and owned sources', async () => {
    renderTab();
    const link = await screen.findByRole('link', { name: b.browse });
    expect(link).toHaveAttribute('href', '/industry/sourcing?sourcing.src=community%2Cowned');
  });

  it('opens the Community Library', async () => {
    const user = userEvent.setup();
    const { onOpenLibrary } = renderTab();
    await user.click(await screen.findByRole('button', { name: b.openLibrary }));
    expect(onOpenLibrary).toHaveBeenCalled();
  });
});
