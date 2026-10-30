import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { db } from '@/db';
import { PHONE_QUERY } from '@/lib/useIsPhone';
import { App } from '@/app/App';
import { stubViewport } from '@/test/viewport';
import { exportRows } from '@/lib/downloadCsv';
import {
  CHAR_ID,
  JITA,
  assetPage1,
  server,
  installAssetsHarness,
  downloadCsv,
  escapeRegExp,
} from '@/test/assetsPage';

vi.mock('virtual:pwa-register/react', async () =>
  (await import('@/test/assetsMocks')).pwaRegisterMock()
);
vi.mock('@/market/mutamarket', async (importOriginal) =>
  (await import('@/test/assetsMocks')).mutamarketMock(
    await importOriginal<typeof import('@/market/mutamarket')>()
  )
);
vi.mock('@/features/market/ItemDetailModal', async () =>
  (await import('@/test/assetsMocks')).itemDetailModalMock()
);
vi.mock('@/sde/loadSde', async () => (await import('@/test/assetsMocks')).loadSdeMock());
vi.mock('@/features/fittings/useFittingCatalogue', async () =>
  (await import('@/test/assetsMocks')).fittingCatalogueMock()
);
vi.mock('@/features/fittings/fittingPilotProfile', async () =>
  (await import('@/test/assetsMocks')).fittingPilotProfileMock()
);
vi.mock('@/sde/loadMarketSde', async () =>
  (await import('@/test/assetsMocks')).loadMarketSdeMock()
);
vi.mock('@/lib/downloadCsv', async (importOriginal) =>
  (await import('@/test/assetsMocks')).downloadCsvMock(
    await importOriginal<typeof import('@/lib/downloadCsv')>()
  )
);

installAssetsHarness();

describe('cross-character search (issue #85)', () => {
  const CHAR_ID_2 = 92;

  beforeEach(async () => {
    // The active character (Pilot One) holds only Tritanium in this block;
    // Pyerite lives exclusively on Pilot Two, so "does the search reach
    // beyond the active character" is unambiguous.
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(assetPage1, { headers: { 'X-Pages': '1' } })
      ),
      http.get(`https://esi.evetech.net/characters/${CHAR_ID_2}/assets`, () =>
        HttpResponse.json(
          [
            {
              item_id: 200,
              type_id: 35,
              quantity: 3,
              location_id: 60003762,
              location_type: 'station' as const,
              location_flag: 'Hangar',
              is_singleton: false,
            },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      ),
      http.get('https://esi.evetech.net/universe/stations/60003762', () =>
        HttpResponse.json({
          station_id: 60003762,
          name: 'Amarr VIII - Emperor Family Academy',
          type_id: 1926,
          system_id: 30002187,
        })
      )
    );

    await db.characters.put({
      characterId: CHAR_ID_2,
      name: 'Pilot Two',
      ownerHash: 'oh2',
      addedAt: 2,
    });
    await db.tokens.put({
      characterId: CHAR_ID_2,
      accessToken: 'access-token-2',
      refreshToken: 'refresh-2',
      expiresAt: Date.now() + 3_600_000,
      scopes: ['esi-assets.read_assets.v1'],
    });
  });

  it('does not show another character’s items until "All characters" is picked', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText(JITA);

    await user.type(screen.getByPlaceholderText(/search items/i), 'pyerite');
    expect(await screen.findByText(/no items match your search/i)).toBeInTheDocument();
    expect(screen.queryByText('Pyerite')).not.toBeInTheDocument();
  });

  async function selectAllCharacters(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'This character' }));
    await user.click(await screen.findByRole('menuitemradio', { name: /^All characters/ }));
  }

  async function selectThisCharacter(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /^All characters/ }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'This character' }));
  }

  it('reaches other characters once "All characters" is picked, tagging the match with a character badge', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText(JITA);

    await selectAllCharacters(user);
    await user.type(screen.getByPlaceholderText(/search items/i), 'pyerite');

    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
    expect(screen.getByText('Pilot Two')).toBeInTheDocument();
  });

  function pageHeader() {
    return screen.getByRole('heading', { level: 1 }).closest('header')!;
  }

  it('puts the one Character picker in the page header', async () => {
    render(<App />);
    await screen.findByText(JITA);
    expect(
      within(pageHeader()).getByRole('button', { name: 'This character' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'This character' })).toHaveLength(1);
  });

  it('marks the picker when "All characters" leaves someone out, naming them', async () => {
    await db.characters.put({ characterId: 93, name: 'Pilot Three', ownerHash: 'oh3', addedAt: 3 });
    // No assets permission: the fan-out skips this Character.
    await db.tokens.put({
      characterId: 93,
      accessToken: 'access-token-3',
      refreshToken: 'refresh-3',
      expiresAt: Date.now() + 3_600_000,
      scopes: [],
    });
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText(JITA);
    await user.click(within(pageHeader()).getByRole('button', { name: 'This character' }));
    await user.click(await screen.findByRole('menuitemradio', { name: /^All characters/ }));
    await user.type(screen.getByPlaceholderText(/search items/i), 'pyerite');

    const picker = await within(pageHeader()).findByRole('button', {
      name: /^All characters · 3\. Not included: Pilot Three$/,
    });
    expect(picker.querySelector('[data-partial-dot]')).not.toBeNull();
    expect(screen.queryByText(/2 of 3/)).not.toBeInTheDocument();
  });

  it('shows the other Characters loading in the picker itself', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID_2}/assets`, async () => {
        await gate;
        return HttpResponse.json([], { headers: { 'X-Pages': '1' } });
      })
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText(JITA);
    await user.click(within(pageHeader()).getByRole('button', { name: 'This character' }));
    await user.click(await screen.findByRole('menuitemradio', { name: /^All characters/ }));

    await waitFor(() =>
      expect(within(pageHeader()).getByRole('button', { name: /^All characters/ })).toHaveAttribute(
        'aria-busy',
        'true'
      )
    );
    release();
    await waitFor(() =>
      expect(
        within(pageHeader()).getByRole('button', { name: /^All characters/ })
      ).not.toHaveAttribute('aria-busy')
    );
  });

  describe('My ships', () => {
    const ship = (itemId: number, locationId: number) => ({
      item_id: itemId,
      type_id: 587,
      quantity: 1,
      location_id: locationId,
      location_type: 'station' as const,
      location_flag: 'Hangar',
      is_singleton: true,
    });

    beforeEach(() => {
      server.use(
        http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
          HttpResponse.json([...assetPage1, ship(300, 60003760)], { headers: { 'X-Pages': '1' } })
        ),
        http.get(`https://esi.evetech.net/characters/${CHAR_ID_2}/assets`, () =>
          HttpResponse.json([ship(301, 60003762)], { headers: { 'X-Pages': '1' } })
        ),
        http.get('https://esi.evetech.net/universe/systems/30002187', () =>
          HttpResponse.json({ system_id: 30002187, name: 'Amamake', security_status: 0.9 })
        )
      );
    });

    async function openMyShips(user: ReturnType<typeof userEvent.setup>) {
      await screen.findByText(JITA);
      await user.click(screen.getByRole('tab', { name: 'Ships' }));
      return screen.findByRole('region', { name: 'My ships' });
    }

    it('opens from the Ships tab and lists only the filtered characters’ ships', async () => {
      const user = userEvent.setup({ delay: null });
      render(<App />);
      const panel = await openMyShips(user);

      expect(window.location.pathname).toBe('/assets/ships');
      expect(await within(panel).findByText('Rifter')).toBeInTheDocument();
      expect(within(panel).getAllByRole('button', { name: 'Rifter' })).toHaveLength(1);
      expect(within(panel).queryByText('Pilot Two')).not.toBeInTheDocument();
      // One character's ships need no Character column.
      expect(within(panel).queryByRole('columnheader', { name: /character/i })).toBeNull();
    });

    it('widens to every character from the page’s Character filter', async () => {
      const user = userEvent.setup({ delay: null });
      render(<App />);
      const panel = await openMyShips(user);
      await within(panel).findByText('Rifter');

      await user.click(screen.getByRole('button', { name: 'This character' }));
      await user.click(await screen.findByRole('menuitemradio', { name: /^All characters/ }));

      await waitFor(() =>
        expect(within(panel).getAllByRole('button', { name: 'Rifter' })).toHaveLength(2)
      );
      expect(within(panel).getByText('Pilot Two')).toBeInTheDocument();
      expect(within(panel).getByRole('columnheader', { name: /character/i })).toBeVisible();
    });

    it('names no one as missing on Ships while the picker reads This character', async () => {
      // The active Character's own read is skipped: that is the body's "couldn't load", not a
      // "Not included" on a filter that never asked for anyone else.
      server.use(
        http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
          HttpResponse.json({ error: 'not found' }, { status: 404 })
        )
      );
      const user = userEvent.setup({ delay: null });
      window.history.replaceState({}, '', '/assets/ships');
      render(<App />);
      await screen.findAllByText("Couldn't load");
      const picker = within(pageHeader()).getByRole('button', { name: 'This character' });
      await user.click(picker);
      await screen.findByRole('menuitemradio', { name: 'This character' });
      expect(screen.queryByText(/Not included/)).not.toBeInTheDocument();
    });

    it('marks the header picker, not the body, when All leaves someone out on Ships and Move', async () => {
      await db.characters.put({
        characterId: 93,
        name: 'Pilot Three',
        ownerHash: 'oh3',
        addedAt: 3,
      });
      await db.tokens.put({
        characterId: 93,
        accessToken: 'access-token-3',
        refreshToken: 'refresh-3',
        expiresAt: Date.now() + 3_600_000,
        scopes: [],
      });
      const user = userEvent.setup({ delay: null });
      render(<App />);
      const panel = await openMyShips(user);
      await within(panel).findByText('Rifter');
      await user.click(within(pageHeader()).getByRole('button', { name: 'This character' }));
      await user.click(await screen.findByRole('menuitemradio', { name: /^All characters/ }));

      const partial = /^All characters · 3\. Not included: Pilot Three$/;
      expect(await within(pageHeader()).findByRole('button', { name: partial })).toBeVisible();
      expect(screen.queryByText(/missing here/)).not.toBeInTheDocument();

      await user.click(screen.getByRole('tab', { name: 'Move' }));
      await screen.findByRole('region', { name: 'Plan a move' });
      expect(await within(pageHeader()).findByRole('button', { name: partial })).toBeVisible();
      expect(screen.queryByText(/missing here/)).not.toBeInTheDocument();
    });

    it('shows the ship class under the name, with sortable columns and a search', async () => {
      server.use(
        http.get('https://esi.evetech.net/universe/groups/25', () =>
          HttpResponse.json({ group_id: 25, name: 'Frigate' })
        )
      );
      const user = userEvent.setup({ delay: null });
      render(<App />);
      const panel = await openMyShips(user);

      expect(await within(panel).findByText('Frigate')).toBeInTheDocument();
      expect(within(panel).queryByText(/ships? across/)).toBeNull();
      expect(within(panel).getByRole('columnheader', { name: /jumps/i })).toHaveAttribute(
        'aria-sort',
        'ascending'
      );
      await user.click(within(panel).getByRole('button', { name: /^ship/i }));
      expect(within(panel).getByRole('columnheader', { name: /^ship/i })).toHaveAttribute(
        'aria-sort',
        'ascending'
      );
      await user.type(within(panel).getByRole('searchbox', { name: /search ships/i }), 'zzz');
      expect(await within(panel).findByText('No ships match your search.')).toBeVisible();
      await user.clear(within(panel).getByRole('searchbox'));
      await user.type(within(panel).getByRole('searchbox'), 'frig');
      expect(within(panel).getByText('Frigate')).toBeVisible();
    });

    it('a row’s ⋮ menu holds Show info, Show fitting, Plan route and Open location assets', async () => {
      const user = userEvent.setup({ delay: null });
      render(<App />);
      const panel = await openMyShips(user);

      await within(panel).findByRole('button', { name: 'Rifter' });
      expect(within(panel).queryByRole('link', { name: 'Rifter' })).toBeNull();
      expect(within(panel).getByRole('button', { name: 'Rifter' }).className).toContain(
        'focus-visible:outline-accent'
      );
      await user.click(within(panel).getByRole('button', { name: 'More actions for Rifter' }));
      expect(await screen.findByRole('menuitem', { name: 'Show info' })).toBeVisible();
      expect(await screen.findByRole('menuitem', { name: 'Show fitting' })).toBeVisible();
      expect(await screen.findByRole('menuitem', { name: 'Plan route' })).toBeVisible();
      await user.click(await screen.findByRole('menuitem', { name: 'Open location assets' }));
      await waitFor(() => expect(window.location.pathname).toContain('/assets/items/60003760'));
    });

    it('offers “Show all characters” when this character owns no ship', async () => {
      server.use(
        http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
          HttpResponse.json(assetPage1, { headers: { 'X-Pages': '1' } })
        )
      );
      const user = userEvent.setup({ delay: null });
      render(<App />);
      const panel = await openMyShips(user);

      await user.click(await within(panel).findByRole('button', { name: 'Show all characters' }));
      expect(await within(panel).findByText('Rifter')).toBeInTheDocument();
      expect(within(panel).getByText('Pilot Two')).toBeInTheDocument();
    });
  });

  it('returns to single-character search once switched back to "This character"', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText(JITA);

    await selectAllCharacters(user);
    await user.type(screen.getByPlaceholderText(/search items/i), 'pyerite');
    expect(await screen.findByText('Pyerite')).toBeInTheDocument();

    await selectThisCharacter(user);
    expect(await screen.findByText(/no items match your search/i)).toBeInTheDocument();
    expect(screen.queryByText('Pyerite')).not.toBeInTheDocument();
  });

  it('caches the other characters’ assets — switching away then back to "All characters" does not refetch (issue #415)', async () => {
    let fetchCount = 0;
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID_2}/assets`, () => {
        fetchCount += 1;
        return HttpResponse.json(
          [
            {
              item_id: 200,
              type_id: 35,
              quantity: 3,
              location_id: 60003762,
              location_type: 'station' as const,
              location_flag: 'Hangar',
              is_singleton: false,
            },
          ],
          { headers: { 'X-Pages': '1' } }
        );
      })
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText(JITA);

    await selectAllCharacters(user);
    await user.type(screen.getByPlaceholderText(/search items/i), 'pyerite');
    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
    expect(fetchCount).toBe(1);

    await selectThisCharacter(user);
    await selectAllCharacters(user);
    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
    expect(fetchCount).toBe(1);
  });

  it('explains why cross-character results are excluded from CSV export, only while they’re actually showing', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText(JITA);

    await user.type(screen.getByPlaceholderText(/search items/i), 'tritanium');
    await screen.findByText('Tritanium');
    expect(screen.queryByText(/CSV export only includes this character/i)).not.toBeInTheDocument();

    await selectAllCharacters(user);
    await user.clear(screen.getByPlaceholderText(/search items/i));
    await user.type(screen.getByPlaceholderText(/search items/i), 'pyerite');

    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
    expect(screen.getByText(/CSV export only includes this character/i)).toBeInTheDocument();
  });

  it('exports only what the search matches, and nothing when nothing does', async () => {
    vi.mocked(exportRows).mockClear();
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText(JITA);

    async function exportCsv() {
      await downloadCsv(user);
    }

    await user.type(screen.getByPlaceholderText(/search items/i), 'tritanium');
    await screen.findByText('Tritanium');
    await exportCsv();

    await waitFor(() => expect(exportRows).toHaveBeenCalledTimes(1));
    expect(vi.mocked(exportRows).mock.calls[0][0]).toBe('csv');
    expect(vi.mocked(exportRows).mock.calls[0][1]).toBe('assets');
    const rows = JSON.stringify(vi.mocked(exportRows).mock.calls[0][2]);
    expect(rows).toContain('Tritanium');
    expect(rows).not.toContain('Pyerite');

    await user.clear(screen.getByPlaceholderText(/search items/i));
    await user.type(screen.getByPlaceholderText(/search items/i), 'no such item');
    await screen.findByText(/no items match/i);
    await exportCsv();
    await waitFor(() => expect(exportRows).toHaveBeenCalledTimes(2));
    expect(vi.mocked(exportRows).mock.calls[1][2]).toEqual([]);
  });
});

describe('jumps-away distance (issue #87)', () => {
  it('shows 0 jumps for a pinned location in the character’s own system', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    const pinButton = await screen.findByRole('button', {
      name: new RegExp(`Pin toggle for ${escapeRegExp(JITA)}`),
    });
    await user.click(pinButton);

    expect(await screen.findByText('0 jumps')).toBeInTheDocument();
  });

  it('counts jumps for a pinned structure on the stargate graph, as Route Safety does', async () => {
    server.use(
      http.get('https://esi.evetech.net/universe/structures/1000000000001', () =>
        HttpResponse.json({
          name: 'A Structure',
          owner_id: 1,
          solar_system_id: 30002187,
        })
      )
    );
    await db.stationPins.put({
      id: `${CHAR_ID}:1000000000001`,
      characterId: CHAR_ID,
      locationId: 1000000000001,
      scope: 'character',
      updatedAt: Date.now(),
    });

    render(<App />);

    expect(await screen.findByText('3 jumps')).toBeInTheDocument();
  });

  it('resolves jumps-away for an "in space" location from its own location id, instead of always showing 0', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            {
              item_id: 30,
              type_id: 650,
              quantity: 1,
              location_id: 30002187,
              location_type: 'solar_system' as const,
              location_flag: 'AutoFit',
              is_singleton: true,
            },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      ),
      http.get('https://esi.evetech.net/universe/systems/30002187', () =>
        HttpResponse.json({ system_id: 30002187, name: 'Amamake', security_status: 0.3 })
      )
    );
    await db.stationPins.put({
      id: `${CHAR_ID}:30002187`,
      characterId: CHAR_ID,
      locationId: 30002187,
      scope: 'character',
      updatedAt: Date.now(),
    });

    render(<App />);

    expect(await screen.findByText('3 jumps')).toBeInTheDocument();
  });

  it('shows "-" with a reason tooltip when the destination system cannot be resolved', async () => {
    // Default handler 403s this structure, so its system id never resolves.
    await db.stationPins.put({
      id: `${CHAR_ID}:1000000000001`,
      characterId: CHAR_ID,
      locationId: 1000000000001,
      scope: 'character',
      updatedAt: Date.now(),
    });

    render(<App />);

    const badge = await screen.findByText('-');
    await userEvent.hover(badge);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('No route found to this station.');
  });

  it('shows "-" with a reason tooltip when the character\'s own location is unavailable', async () => {
    // A character who hasn't re-consented to esi-location.read_location.v1
    // yet (the default for every existing user until they next log in) —
    // this must degrade the badge, not trip the shell-wide re-auth banner.
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/location`, () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
      )
    );

    render(<App />);

    // Both visible locations degrade the same way — no pin needed for either.
    const badges = await screen.findAllByText('-');
    await userEvent.hover(badges[0]);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Character location unavailable.');
    expect(screen.queryByText('Log in again to see your assets')).not.toBeInTheDocument();
  });

  it('opens on the Travel default and lets the user switch preference for this view', async () => {
    const user = userEvent.setup({ delay: null });
    server.use(
      http.get('https://esi.evetech.net/universe/structures/1000000000001', () =>
        HttpResponse.json({
          name: 'A Structure',
          owner_id: 1,
          solar_system_id: 30002187,
        })
      )
    );
    await db.stationPins.put({
      id: `${CHAR_ID}:1000000000001`,
      characterId: CHAR_ID,
      locationId: 1000000000001,
      scope: 'character',
      updatedAt: Date.now(),
    });

    render(<App />);
    // The Travel default is Prefer safer: the three jumps through high-sec Hed and Far.
    await screen.findByText('3 jumps');

    await user.click(screen.getByRole('combobox', { name: 'Route' }));
    await user.click(await screen.findByRole('option', { name: 'Prefer shorter' }));

    expect(await screen.findByText('2 jumps')).toBeInTheDocument();
  });

  describe('station header on a phone (#2989)', () => {
    it('puts security · ISK · jumps on a second line, jumps opening the route', async () => {
      const restoreViewport = stubViewport(PHONE_QUERY);
      try {
        window.history.pushState({}, '', '/assets/items/60003760');
        render(<App />);

        const jumps = await screen.findByRole('button', { name: '0 jumps' });
        expect(screen.getAllByRole('button', { name: '0 jumps' })).toHaveLength(1);
        const heading = screen.getByRole('heading', { level: 2 });
        const facts = jumps.closest('span.flex-wrap') as HTMLElement;
        // Name on its own line; the facts line follows it inside the same column.
        // The heading sits in a row with its rename pencil; the column holds the facts line.
        expect(heading.closest('div.flex-col')).toContainElement(facts);
        expect(facts).not.toContainElement(heading);
        // One dot between each pair of items, none leading or trailing.
        expect(facts.querySelectorAll('[aria-hidden="true"]')).toHaveLength(
          facts.children.length - 1
        );
        expect(facts.textContent).toMatch(/^[^·].*·0 jumps$/);
        expect(jumps.className).toContain('min-h-9');
      } finally {
        restoreViewport();
      }
    });

    it('leaves desktop with the security and jumps cluster beside the heading', async () => {
      window.history.pushState({}, '', '/assets/items/60003760');
      render(<App />);

      const jumps = await screen.findByRole('button', { name: '0 jumps' });
      expect(screen.getAllByRole('button', { name: '0 jumps' })).toHaveLength(1);
      expect(jumps.closest('[class~="sm:flex"]')).not.toBeNull();
      expect(jumps.className).not.toContain('min-h-9');
    });
  });
});
