import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { NO_CORP_CAPABILITIES } from '@/engine/corpRoles';
import type { MarketTypeEntry } from '@/sde/marketTypes';
import { CommandPaletteHost } from './CommandPaletteHost';
import { createMarketItemCatalogue, type MarketItemCatalogue } from './marketItems';
import { useCommandPalette } from './store';
import { GLOBAL_CACHE_CHARACTER_ID, writeCached } from '@/esi/cache';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
import { loadPaletteContacts } from './contactsProvider';

// The session catalogue is module-level; each test gets a fresh one behind it.
const catalogueHolder = vi.hoisted(() => ({ current: null as MarketItemCatalogue | null }));
vi.mock('./marketItems', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./marketItems')>();
  return {
    ...actual,
    marketItemCatalogue: {
      load: () => catalogueHolder.current!.load(),
      peek: () => catalogueHolder.current!.peek(),
    },
  };
});
const CATALOGUE: MarketTypeEntry[] = [
  { typeId: 34, name: 'Tritanium', marketGroupId: 1, volume: 1 },
  { typeId: 35, name: 'Pyerite', marketGroupId: 1, volume: 1 },
  { typeId: 587, name: 'Rifter', marketGroupId: 2, volume: 1 },
];
function installCatalogue(load: () => Promise<MarketTypeEntry[]>) {
  catalogueHolder.current = createMarketItemCatalogue(load);
}
function lateCatalogue() {
  let resolve!: (catalogue: MarketTypeEntry[]) => void;
  const load = vi.fn(() => new Promise<MarketTypeEntry[]>((res) => (resolve = res)));
  installCatalogue(load);
  return { load, resolve: (catalogue: MarketTypeEntry[]) => resolve(catalogue) };
}

// The real modal reads ESI; this stand-in is a real `Modal`, so focus
// hand-back is the real thing.
vi.mock('@/features/market/ItemDetailModal', async () => {
  const { Modal } = await import('@/components/ui');
  return {
    ItemDetailModal: ({
      typeId,
      itemName,
      onClose,
      showOpenInMarket,
    }: {
      typeId: number;
      itemName: string;
      onClose: () => void;
      showOpenInMarket?: boolean;
    }) => (
      <Modal open onClose={onClose} title={itemName}>
        <p>{`Item Detail ${typeId}${showOpenInMarket ? ' with market link' : ''}`}</p>
      </Modal>
    ),
  };
});

// One Set, as the real hook memoises it: a fresh one per render would be a
// fresh search per render, and a failing async group would never settle.
const LOCKED = new Set(['/assets']);
vi.mock('@/app/useGrantedScopes', () => ({
  useGrantedScopes: () => undefined,
  useLockedRoutes: () => LOCKED,
}));
vi.mock('@/features/corp/useCorpNavVisible', () => ({ useCorpNavVisible: () => false }));
vi.mock('@/features/corp/useCorpAccess', () => ({
  useCorpAccess: () => ({ state: 'none', capabilities: NO_CORP_CAPABILITIES }),
}));
const loadLpCorporations = vi.hoisted(() => vi.fn());
vi.mock('@/sde/loadMarketSde', () => ({ loadLpCorporations }));
const beginAddCharacterLogin = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/app/loginFlow', () => ({ beginAddCharacterLogin }));

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/overview']}>
      <label>
        Page search
        <input />
      </label>
      <CommandPaletteHost />
      <Where />
    </MemoryRouter>
  );
}

beforeEach(async () => {
  installCatalogue(async () => CATALOGUE);
  await db.characters.clear();
  await db.characters.bulkPut([
    { characterId: 1, name: 'Alpha Pilot', ownerHash: 'a', addedAt: 1 },
    { characterId: 2, name: 'Beta Pilot', ownerHash: 'b', addedAt: 2 },
  ] as never);
  await useActiveCharacter.getState().setActiveCharacter(1);
  await db.esiCache.clear();
  loadLpCorporations.mockResolvedValue([
    { id: 1000130, name: 'Sisters of EVE' },
    { id: 1000125, name: 'CONCORD' },
  ]);
});

afterEach(() => {
  act(() => useCommandPalette.getState().hide());
});

describe('CommandPalette', () => {
  it('opens on Ctrl+K from inside a text field', async () => {
    const user = userEvent.setup();
    renderShell();
    const pageSearch = screen.getByRole('textbox', { name: 'Page search' });
    await user.click(pageSearch);

    await user.keyboard('{Control>}k{/Control}');
    const input = await screen.findByRole('combobox', {
      name: 'Search pages, commands, characters, assets and items',
    });
    expect(input).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(pageSearch).toHaveFocus();
  });

  it('does not stack over another open dialog', async () => {
    const user = userEvent.setup();
    renderShell();
    const other = document.createElement('dialog');
    document.body.append(other);
    other.showModal();
    try {
      await user.keyboard('{Control>}k{/Control}');
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    } finally {
      other.close();
      other.remove();
    }
  });

  it('lists pages on an empty query as a quick navigator', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.keyboard('{Control>}k{/Control}');
    const pages = await screen.findByRole('group', { name: 'Pages' });
    expect(within(pages).getByRole('option', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Commands' })).not.toBeInTheDocument();
  });

  it('finds Industry › Opportunities for "opp" and Enter navigates there', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.keyboard('{Control>}k{/Control}');
    await user.type(await screen.findByRole('combobox'), 'opp');

    const pages = screen.getByRole('group', { name: 'Pages' });
    const option = within(pages).getByRole('option', { name: 'Industry › Opportunities' });
    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-activedescendant', option.id);

    await user.keyboard('{Enter}');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/industry/opportunities');
  });

  it('replaces its history entry when a result navigates, so Back returns to the page under it', async () => {
    window.history.replaceState(null, '', '/overview');
    const user = userEvent.setup();
    render(
      <BrowserRouter>
        <CommandPaletteHost />
        <Where />
      </BrowserRouter>
    );
    await user.keyboard('{Control>}k{/Control}');
    await user.type(await screen.findByRole('combobox'), 'opp');
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/industry/opportunities');
    // The palette's own entry was replaced, not left behind.
    expect(window.history.state).not.toHaveProperty('__neocomOverlay');

    act(() => window.history.back());
    await vi.waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/overview'));
    // Landed on the original entry, not a dead one the overlay left behind.
    expect(window.history.state).not.toHaveProperty('__neocomOverlay');
  });

  it('keeps groups in a fixed order, hides empty ones, and arrows across the boundary', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.keyboard('{Control>}k{/Control}');
    // "settings" matches pages and a command, and no Character.
    await user.type(await screen.findByRole('combobox'), 'settings');

    const groups = screen
      .getAllByRole('group')
      .map((group) => group.getAttribute('aria-labelledby'));
    const names = groups.map((id) => document.getElementById(id!)!.textContent);
    expect(names).toEqual(['Pages', 'Commands']);

    const pageOptions = within(screen.getByRole('group', { name: 'Pages' })).getAllByRole('option');
    for (let i = 0; i < pageOptions.length; i++) await user.keyboard('{ArrowDown}');
    const command = within(screen.getByRole('group', { name: 'Commands' })).getAllByRole(
      'option'
    )[0];
    expect(command).toHaveAttribute('aria-selected', 'true');
    // Wraps back to the first page from the last command.
    await user.keyboard('{End}{ArrowDown}');
    expect(pageOptions[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('marks a locked page and still navigates to it', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.keyboard('{Control>}k{/Control}');
    await user.type(await screen.findByRole('combobox'), 'assets');
    const assets = screen.getByRole('option', { name: 'Assets, Needs a new login' });
    await user.click(assets);
    expect(screen.getByTestId('where')).toHaveTextContent('/assets');
  });

  it('switches the active Character', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.keyboard('{Control>}k{/Control}');
    await user.type(await screen.findByRole('combobox'), 'beta');
    const characters = await screen.findByRole('group', { name: 'Characters' });
    await user.click(within(characters).getByRole('option', { name: 'Beta Pilot' }));
    await vi.waitFor(() => expect(useActiveCharacter.getState().activeCharacterId).toBe(2));
  });

  it('starts loading the item catalogue on open and fills Market Items in for the latest query', async () => {
    const catalogue = lateCatalogue();
    const user = userEvent.setup();
    renderShell();
    await user.keyboard('{Control>}k{/Control}');
    const input = await screen.findByRole('combobox');
    expect(catalogue.load).toHaveBeenCalledTimes(1);

    await user.type(input, 'rif');
    expect(input).toHaveValue('rif');
    expect(screen.getByText('Searching…')).toBeInTheDocument();
    await user.type(input, 't');
    expect(input).toHaveValue('rift');

    await act(async () => catalogue.resolve(CATALOGUE));
    const items = await screen.findByRole('group', { name: 'Market items' });
    expect(
      within(items)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['Rifter']);
    expect(screen.queryByText('Searching…')).not.toBeInTheDocument();
    expect(catalogue.load).toHaveBeenCalledTimes(1);
  });

  it('shows a catalogue failure inside Market Items only; the other groups keep working', async () => {
    installCatalogue(() => Promise.reject(new Error('offline')));
    const user = userEvent.setup();
    renderShell();
    await user.keyboard('{Control>}k{/Control}');
    await user.type(await screen.findByRole('combobox'), 'settings');

    const items = await screen.findByRole('group', { name: 'Market items' });
    expect(await within(items).findByText("Couldn't load these results.")).toBeInTheDocument();
    expect(within(items).queryByRole('option')).not.toBeInTheDocument();
    const pages = screen.getByRole('group', { name: 'Pages' });
    // Announced too: the error row is not an option, so the count alone would miss it.
    expect(screen.getByText(/results?\. Couldn't load these results\.$/)).toHaveAttribute(
      'aria-live',
      'polite'
    );
    // The error row is never highlighted; the best page still is.
    expect(within(pages).getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/settings');
  });

  it('opens Item Detail over the current page and hands focus back on close', async () => {
    const user = userEvent.setup();
    renderShell();
    const pageSearch = screen.getByRole('textbox', { name: 'Page search' });
    await user.click(pageSearch);
    await user.keyboard('{Control>}k{/Control}');
    await user.type(await screen.findByRole('combobox'), 'rifter');
    const items = await screen.findByRole('group', { name: 'Market items' });
    await user.click(within(items).getByRole('option', { name: 'Rifter' }));

    const detail = await screen.findByRole('dialog', { name: 'Rifter' });
    expect(within(detail).getByText('Item Detail 587 with market link')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/overview');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Rifter' })).not.toBeInTheDocument();
    expect(pageSearch).toHaveFocus();
  });

  it('runs the Add character command through the login flow', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.keyboard('{Control>}k{/Control}');
    await user.type(await screen.findByRole('combobox'), 'add char');
    await user.keyboard('{Enter}');
    expect(beginAddCharacterLogin).toHaveBeenCalledTimes(1);
  });

  describe('Contacts group', () => {
    const fetchSpy = vi.fn();

    beforeEach(async () => {
      vi.stubGlobal('fetch', fetchSpy);
      fetchSpy.mockReset();
      usePublicInfoModalStore.getState().close();
      await Promise.all([db.tokens.clear(), db.esiCache.clear()]);
      await writeCached(
        1,
        'contacts',
        [{ contact_id: 90, contact_type: 'corporation', standing: -10 }],
        Date.now()
      );
      await writeCached(GLOBAL_CACHE_CHARACTER_ID, 'name:90', 'Pirate Holdings', Date.now());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    async function grantContacts(scopes: string[]) {
      await db.tokens.put({
        characterId: 1,
        accessToken: 'x',
        refreshToken: 'y',
        expiresAt: Date.now() + 60_000,
        scopes,
      });
    }

    it('lists a matching contact with its standing, opens Public Info, and never fetches', async () => {
      await grantContacts(['esi-characters.read_contacts.v1']);
      const user = userEvent.setup();
      renderShell();
      await user.keyboard('{Control>}k{/Control}');
      await user.type(await screen.findByRole('combobox'), 'pirate');

      const option = await screen.findByRole('option', { name: /Pirate Holdings/ });
      expect(screen.getByRole('group', { name: 'Contacts' })).toContainElement(option);
      expect(option).toHaveTextContent('Corp · -10 Alpha Pilot');
      await user.keyboard('{Enter}');
      expect(usePublicInfoModalStore.getState().request).toEqual({ kind: 'corporation', id: 90 });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('never shows the group without the contacts scope', async () => {
      await grantContacts([]);
      const user = userEvent.setup();
      renderShell();
      await user.keyboard('{Control>}k{/Control}');
      await user.type(await screen.findByRole('combobox'), 'pirate');
      // Let the cache read land; it answers nothing, so no group ever renders.
      await act(async () => {
        await loadPaletteContacts();
      });
      expect(screen.queryByRole('group', { name: 'Contacts' })).not.toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('LP Stores', () => {
    it('finds "Sisters of EVE" for "sisters" and Enter opens its store', async () => {
      const user = userEvent.setup();
      renderShell();
      await user.keyboard('{Control>}k{/Control}');
      await user.type(await screen.findByRole('combobox'), 'sisters');
      const stores = await screen.findByRole('group', { name: 'LP Stores' });
      const option = await within(stores).findByRole('option', { name: 'Sisters of EVE' });
      expect(option).toHaveAttribute('aria-selected', 'true');
      await user.keyboard('{Enter}');
      expect(screen.getByTestId('where')).toHaveTextContent('/market/lp-store/1000130');
    });

    it('shows the balance only for a corp the active Character holds LP with', async () => {
      await writeCached(1, 'loyalty', [{ corporation_id: 1000130, loyalty_points: 12500 }], 1);
      const user = userEvent.setup();
      renderShell();
      await user.keyboard('{Control>}k{/Control}');
      await user.type(await screen.findByRole('combobox'), 'co');
      const stores = await screen.findByRole('group', { name: 'LP Stores' });
      expect(await within(stores).findByRole('option', { name: 'CONCORD' })).not.toHaveTextContent(
        'LP'
      );

      await user.clear(screen.getByRole('combobox'));
      await user.type(screen.getByRole('combobox'), 'sisters');
      const sisters = await within(
        await screen.findByRole('group', { name: 'LP Stores' })
      ).findByRole('option', { name: /Sisters of EVE/ });
      expect(sisters).toHaveTextContent((12500).toLocaleString() + ' LP');
    });

    it('never blocks typing or the other groups while the corporation list loads', async () => {
      loadLpCorporations.mockReturnValue(new Promise(() => {}));
      const user = userEvent.setup();
      renderShell();
      await user.keyboard('{Control>}k{/Control}');
      const input = await screen.findByRole('combobox');
      await user.type(input, 'opp');
      expect(input).toHaveValue('opp');
      const pages = screen.getByRole('group', { name: 'Pages' });
      expect(
        within(pages).getByRole('option', { name: 'Industry › Opportunities' })
      ).toHaveAttribute('aria-selected', 'true');
      expect(
        within(screen.getByRole('group', { name: 'LP Stores' })).getByText('Searching…')
      ).toBeInTheDocument();
    });
  });
});
