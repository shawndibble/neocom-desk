import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { configureClipboard } from '@/lib/clipboard';
import { App } from '@/app/App';
import {
  CHAR_ID,
  JITA,
  STRUCTURE,
  assetPage1,
  server,
  installAssetsHarness,
  clickTool,
  openLocation,
  goBack,
} from '@/test/assetsPage';
import { ABYSSAL_NEUT, abyssalEstimate } from '@/test/assetsMocks';

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

describe('multi-select and bulk actions (issue #90)', () => {
  afterEach(() => configureClipboard(null));

  it('shows no checkboxes in browsing mode; toggling select mode reveals them', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText(JITA);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);

    await clickTool(user, 'Select');

    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
  });

  it('checking a ship/container node cascades selection to all of its descendant items', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            {
              item_id: 10,
              type_id: 650,
              quantity: 1,
              location_id: 60003760,
              location_type: 'station' as const,
              location_flag: 'Hangar',
              is_singleton: true,
            },
            {
              item_id: 11,
              type_id: 34,
              quantity: 50,
              location_id: 10,
              location_type: 'item' as const,
              location_flag: 'Cargo',
              is_singleton: false,
            },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      )
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await openLocation(user, JITA);
    await screen.findByRole('heading', { name: 'Drake' });

    await clickTool(user, 'Select');
    await user.click(screen.getByRole('checkbox', { name: 'Select Drake and its contents' }));

    expect(
      await screen.findByText('1 item selected', { selector: '[aria-hidden="true"]' })
    ).toBeInTheDocument();
  });

  it('turning off select mode clears the current selection', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await openLocation(user, JITA);
    await screen.findByText('Tritanium');

    await clickTool(user, 'Select');
    await user.click(screen.getByRole('checkbox', { name: 'Select Tritanium' }));
    expect(
      await screen.findByText('1 item selected', { selector: '[aria-hidden="true"]' })
    ).toBeInTheDocument();

    await clickTool(user, 'Select');
    await clickTool(user, 'Select');

    expect(screen.queryByText('1 item selected')).not.toBeInTheDocument();
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).not.toBeChecked();
    }
  });

  it('adds every selected item to the Quickbar via the bulk action bar', async () => {
    // Both items at one location so both are on screen together — the
    // default fixture spreads them across two locations on purpose, to keep
    // the location-scoping tests unambiguous.
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            { ...assetPage1[0], item_id: 1, type_id: 34 },
            { ...assetPage1[0], item_id: 2, type_id: 35 },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      )
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await openLocation(user, JITA);
    await screen.findByText('Tritanium');
    await screen.findByText('Pyerite');

    await clickTool(user, 'Select');
    await user.click(screen.getByRole('checkbox', { name: 'Select Tritanium' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Pyerite' }));
    await user.click(screen.getByRole('button', { name: 'Add to Quickbar' }));

    await waitFor(async () => {
      const record = await db.quickbars.get(String(CHAR_ID));
      expect(record?.items).toEqual([
        { typeId: 34, name: 'Tritanium' },
        { typeId: 35, name: 'Pyerite' },
      ]);
    });
  });

  it('leaves a Mutated module out of the bulk Quickbar add: it has no market', async () => {
    await db.quickbars.clear(); // the test above leaves its two items there
    abyssalEstimate.mockResolvedValue({
      status: 'unknown',
      value: null,
      source: 'mutamarket',
      fetchedAt: Date.now(),
      valueUpdatedAt: null,
      url: null,
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            { ...assetPage1[0], item_id: 1, type_id: 34 },
            { ...assetPage1[0], item_id: 2, type_id: ABYSSAL_NEUT, is_singleton: true },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      )
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await openLocation(user, JITA);
    await screen.findByText('Tritanium');
    await screen.findByText('Heavy Abyssal Energy Neutralizer');
    // Estimate asked for = lookup loaded, so the bulk add can tell the type is Abyssal.
    await waitFor(() => expect(abyssalEstimate).toHaveBeenCalled());

    await clickTool(user, 'Select');
    await user.click(screen.getByRole('checkbox', { name: 'Select Tritanium' }));
    await user.click(
      screen.getByRole('checkbox', { name: 'Select Heavy Abyssal Energy Neutralizer' })
    );
    await user.click(screen.getByRole('button', { name: 'Add to Quickbar' }));

    await waitFor(async () => {
      const record = await db.quickbars.get(String(CHAR_ID));
      expect(record?.items).toEqual([{ typeId: 34, name: 'Tritanium' }]);
    });
  });

  it('has no bulk Add to Compare, and Appraise opens the appraisal with the selection', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await openLocation(user, JITA);
    await screen.findByText('Tritanium');

    await clickTool(user, 'Select');
    await user.click(screen.getByRole('checkbox', { name: 'Select Tritanium' }));
    expect(screen.queryByRole('button', { name: 'Add to Compare' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Appraise' }));

    expect(window.location.pathname).toBe('/market/appraisal');
  });

  it('copies every selected item’s name, newline-separated, to the clipboard', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            { ...assetPage1[0], item_id: 1, type_id: 34 },
            { ...assetPage1[0], item_id: 2, type_id: 35 },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      )
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    configureClipboard(writeText);
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await openLocation(user, JITA);
    await screen.findByText('Tritanium');
    await screen.findByText('Pyerite');

    await clickTool(user, 'Select');
    await user.click(screen.getByRole('checkbox', { name: 'Select Tritanium' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Pyerite' }));
    await user.click(screen.getByRole('button', { name: 'Copy names' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('Tritanium\nPyerite');
    });
  });

  it('copies the selection as "Name xQty" lines, summing identical items', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            { ...assetPage1[0], item_id: 1, type_id: 34, quantity: 1000 },
            { ...assetPage1[0], item_id: 2, type_id: 34, quantity: 500 },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      )
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    configureClipboard(writeText);
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await openLocation(user, JITA);
    await screen.findAllByText('Tritanium');

    await clickTool(user, 'Select');
    for (const box of screen.getAllByRole('checkbox', { name: 'Select Tritanium' })) {
      await user.click(box);
    }
    await user.click(screen.getByRole('button', { name: 'Copy with quantities' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('Tritanium x1500');
    });
  });

  it('"Select all in view" selects every item at the current level without needing to check each one (issue #415)', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            { ...assetPage1[0], item_id: 1, type_id: 34 },
            { ...assetPage1[0], item_id: 2, type_id: 35 },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      )
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await openLocation(user, JITA);
    await screen.findByText('Tritanium');
    await screen.findByText('Pyerite');

    await clickTool(user, 'Select');
    await user.click(screen.getByRole('button', { name: 'Select all in view' }));

    expect(
      await screen.findByText('2 items selected', { selector: '[aria-hidden="true"]' })
    ).toBeInTheDocument();
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).toBeChecked();
    }
  });

  it('"Deselect all" clears the selection in one action', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            { ...assetPage1[0], item_id: 1, type_id: 34 },
            { ...assetPage1[0], item_id: 2, type_id: 35 },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      )
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await openLocation(user, JITA);
    await screen.findByText('Tritanium');
    await screen.findByText('Pyerite');

    await clickTool(user, 'Select');
    await user.click(screen.getByRole('button', { name: 'Select all in view' }));
    expect(
      await screen.findByText('2 items selected', { selector: '[aria-hidden="true"]' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Deselect all' }));

    expect(screen.queryByText(/items selected/)).not.toBeInTheDocument();
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).not.toBeChecked();
    }
  });

  it('"Deselect all" is disabled until something is selected', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await openLocation(user, JITA);
    await screen.findByText('Tritanium');

    await clickTool(user, 'Select');

    expect(screen.getByRole('button', { name: 'Deselect all' })).toBeDisabled();
  });
});

describe('view state in the URL (issue #1306)', () => {
  const CHAR_ID_2 = 92;

  async function seedSecondCharacter() {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID_2}/assets`, () =>
        HttpResponse.json([], { headers: { 'X-Pages': '1' } })
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
  }

  it('applies search, All Items and min value from the URL on first render', async () => {
    server.use(
      http.get('https://esi.evetech.net/markets/prices', () =>
        HttpResponse.json([
          { type_id: 34, average_price: 5 },
          { type_id: 35, average_price: 5000 },
        ])
      )
    );
    window.history.replaceState({}, '', '/assets?all=1&min=10000');
    render(<App />);

    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tools' }));
    expect(await screen.findByRole('menuitemcheckbox', { name: 'All items' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByLabelText('Minimum value')).toHaveValue('10000');
  });

  it('reads the search text from the URL', async () => {
    window.history.replaceState({}, '', '/assets?q=pyerite');
    render(<App />);

    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search items/i)).toHaveValue('pyerite');
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();
  });

  it('writes changes to the URL and drops each key once back at its default', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText(JITA);
    expect(window.location.search).toBe('');

    await user.type(screen.getByPlaceholderText(/search items/i), 'trit');
    await waitFor(() => expect(window.location.search).toBe('?q=trit'));

    await clickTool(user, 'All items');
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('all')).toBe('1'));

    await user.clear(screen.getByPlaceholderText(/search items/i));
    await clickTool(user, 'All items');
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('falls back to defaults for garbage values', async () => {
    window.history.replaceState({}, '', '/assets?all=yes&chars=bogus');
    await seedSecondCharacter();
    render(<App />);

    expect(await screen.findByText(JITA)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tools' }));
    expect(await screen.findByRole('menuitemcheckbox', { name: 'All items' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'This character' })).toBeInTheDocument();
  });

  it('keeps the query string while drilling down, and the path still resolves', async () => {
    const user = userEvent.setup({ delay: null });
    window.history.replaceState({}, '', '/assets?min=0');
    render(<App />);

    await openLocation(user, JITA);
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/assets/items/60003760');
    expect(window.location.search).toBe('?min=0');

    await goBack(user);
    await screen.findByText(STRUCTURE);
    expect(window.location.pathname).toBe('/assets/items');
    expect(window.location.search).toBe('?min=0');
  });

  it('opens a drilled-in path with a query already on it', async () => {
    window.history.replaceState({}, '', '/assets/items/60003760?q=pyerite');
    render(<App />);

    // Search wins over browsing, as it does when typed.
    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/assets/items/60003760');
  });

  it('leaves search when a hit is opened, so the place lists its contents', async () => {
    const user = userEvent.setup({ delay: null });
    window.history.replaceState({}, '', '/assets?q=trit&chars=current');
    render(<App />);

    await user.click(await screen.findByRole('link', { name: /Tritanium/ }));

    await waitFor(() => expect(window.location.pathname).toBe('/assets/items/60003760'));
    expect(window.location.search).toBe('?chars=current');
    expect(await screen.findByRole('button', { name: /back one level/i })).toBeInTheDocument();
    expect(screen.queryByText(/match/i)).not.toBeInTheDocument();
  });

  it('puts a More actions menu at the far right of a search hit', async () => {
    const user = userEvent.setup({ delay: null });
    window.history.replaceState({}, '', '/assets?q=trit');
    render(<App />);
    await screen.findByRole('link', { name: /Tritanium/ });

    await user.click(screen.getByRole('button', { name: /more actions/i }));

    expect(await screen.findByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
  });

  it('uses the synced default character filter when the URL has none, without writing it to the URL', async () => {
    await seedSecondCharacter();
    await db.settings.put({ key: 'sync.defaultCharacterFilter', value: 'all' });
    render(<App />);

    expect(await screen.findByRole('button', { name: /^All characters/ })).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('lets the URL override the synced default, and never writes the URL value back to it', async () => {
    await seedSecondCharacter();
    await db.settings.put({ key: 'sync.defaultCharacterFilter', value: 'all' });
    window.history.replaceState({}, '', '/assets?chars=current');
    render(<App />);

    expect(await screen.findByRole('button', { name: 'This character' })).toBeInTheDocument();
    expect((await db.settings.get('sync.defaultCharacterFilter'))?.value).toBe('all');
  });

  it.each(['char', 'chars'])(
    'opens for the Character ?%s= names, stating whose data it is, without switching the active one (issue #2936)',
    async (key) => {
      await seedSecondCharacter();
      window.history.replaceState({}, '', `/assets?${key}=${CHAR_ID_2}`);
      render(<App />);

      expect(await screen.findByText('Pilot Two only')).toBeInTheDocument();
      expect(useActiveCharacter.getState().activeCharacterId).toBe(CHAR_ID);
    }
  );

  it('shows the grant note, not an empty list, for a named Character without the assets scope (issue #2936)', async () => {
    await seedSecondCharacter();
    await db.tokens.update(CHAR_ID_2, { scopes: [] });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID_2}/assets`, () =>
        HttpResponse.json({ error: 'forbidden' }, { status: 403 })
      )
    );
    window.history.replaceState({}, '', `/assets?char=${CHAR_ID_2}`);
    render(<App />);

    expect(await screen.findByText('Log in again to see your assets')).toBeInTheDocument();
  });

  it('writes a picked character filter to the URL', async () => {
    const user = userEvent.setup({ delay: null });
    await seedSecondCharacter();
    render(<App />);
    await screen.findByText(JITA);

    await user.click(screen.getByRole('button', { name: 'This character' }));
    await user.click(await screen.findByRole('menuitemradio', { name: /^All characters/ }));

    await waitFor(() => expect(window.location.search).toBe('?chars=all'));
    expect((await db.settings.get('sync.defaultCharacterFilter'))?.value).toBeUndefined();
  });
});
