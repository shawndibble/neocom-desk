import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { db } from '@/db';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
import { App } from '@/app/App';
import { stubViewport } from '@/test/viewport';
import {
  CHAR_ID,
  JITA,
  STRUCTURE,
  assetPage1,
  assetPage2,
  server,
  installAssetsHarness,
  openLocation,
  goBack,
  locationOrder,
  escapeRegExp,
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

describe('Assets', () => {
  it('shows the word Tools on its trigger and keeps Refresh inside the menu, not beside it (#2945)', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    expect(await screen.findByText(JITA)).toBeInTheDocument();

    const tools = screen.getByRole('button', { name: 'Tools' });
    expect(tools).toHaveTextContent('Tools');
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();

    await user.click(tools);
    expect(await screen.findByRole('menuitem', { name: /^Refresh/ })).toBeEnabled();
    // My ships and Plan a move are the Ships and Move tabs now, not menu items.
    expect(screen.queryByRole('menuitem', { name: /^My ships/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^Plan a move/ })).not.toBeInTheDocument();
  });

  it('shows Tools as its icon-only ⋮ below md', async () => {
    const restoreViewport = stubViewport(NARROW_QUERY);
    render(<App />);
    expect(await screen.findByText(JITA)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tools' })).not.toHaveTextContent('Tools');
    restoreViewport();
  });

  it('has Items, Ships and Move tabs, opening on Items', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    expect(await screen.findByText(JITA)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/assets/items');
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(expect.arrayContaining(['Items', 'Ships', 'Move']));
    expect(screen.getByRole('tab', { name: 'Items' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: 'Move' }));
    expect(window.location.pathname).toBe('/assets/move');
    expect(await screen.findByRole('region', { name: 'Plan a move' })).toBeVisible();
    // Item-only controls and the Tools menu stay on the Items tab.
    expect(screen.queryByRole('searchbox', { name: /search items/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tools' })).not.toBeInTheDocument();
  });

  it('keeps the query string when switching tabs', async () => {
    const user = userEvent.setup({ delay: null });
    window.history.replaceState({}, '', '/assets/items?chars=current&min=0');
    render(<App />);
    expect(await screen.findByText(JITA)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Ships' }));
    expect(window.location.pathname).toBe('/assets/ships');
    expect(window.location.search).toBe('?chars=current&min=0');
  });

  it('keeps focus in the tab strip when arrowing from Ships onto Items (WCAG 2.4.3)', async () => {
    const user = userEvent.setup({ delay: null });
    window.history.replaceState({}, '', '/assets/ships');
    render(<App />);
    const ships = await screen.findByRole('tab', { name: 'Ships' });
    ships.focus();
    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(window.location.pathname).toBe('/assets/items'));
    expect(screen.getByRole('tab', { name: 'Items' })).toHaveFocus();
  });

  it('puts focus back on the search box when Clear search removes itself (WCAG 2.4.3)', async () => {
    const user = userEvent.setup({ delay: null });
    window.history.replaceState({}, '', '/assets/items?q=trit');
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /clear search/i }));
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus());
  });

  it('moves a pre-tabs drill-down link under the Items tab', async () => {
    window.history.replaceState({}, '', '/assets/60003760?min=0');
    render(<App />);
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/assets/items/60003760');
    expect(window.location.search).toBe('?min=0');
  });

  it('opens a pre-tabs ?view=ships link on the Ships tab', async () => {
    window.history.replaceState({}, '', '/assets?view=ships');
    render(<App />);
    expect(await screen.findByRole('region', { name: 'My ships' })).toBeVisible();
    expect(window.location.pathname).toBe('/assets/ships');
    expect(window.location.search).toBe('');
  });

  it('heads the two toggles with a View caption and separates them from the actions (#3087)', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    expect(await screen.findByText(JITA)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tools' }));

    const menu = await screen.findByRole('menu');
    const caption = within(menu).getByText('View');
    expect(within(menu).queryByRole('menuitem', { name: 'View' })).not.toBeInTheDocument();
    const allItems = within(menu).getByRole('menuitemcheckbox', { name: 'All items' });
    const select = within(menu).getByRole('menuitemcheckbox', { name: 'Select' });
    const separator = within(menu).getAllByRole('separator')[0];
    const refresh = within(menu).getByRole('menuitem', { name: /^Refresh/ });
    const before = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(caption, allItems)).toBe(true);
    expect(before(allItems, select)).toBe(true);
    expect(before(select, separator)).toBe(true);
    expect(before(separator, refresh)).toBe(true);

    expect(allItems).toHaveAttribute('aria-checked', 'false');
    await user.click(allItems);
    await user.click(screen.getByRole('button', { name: 'Tools' }));
    expect(await screen.findByRole('menuitemcheckbox', { name: 'All items' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('lists locations at the root; drilling into one shows its contents', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    expect(await screen.findByText(JITA)).toBeInTheDocument();
    expect(screen.getByText(STRUCTURE)).toBeInTheDocument();
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();
    expect(screen.queryByText('Pyerite')).not.toBeInTheDocument();

    await openLocation(user, JITA);
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.queryByText('Pyerite')).not.toBeInTheDocument();

    await goBack(user);
    await openLocation(user, STRUCTURE);
    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
  });

  it('shows the total value after the location count in the block title bar, hidden when drilled in (issue #1617)', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    expect(await screen.findByText(JITA)).toBeInTheDocument();
    const locationHeadings = screen
      .getAllByRole('heading', { level: 2 })
      .filter((el) => /locations? ·/.test(el.textContent ?? ''));
    expect(locationHeadings).toHaveLength(1);
    const locationHeading = locationHeadings[0];
    expect(locationHeading.closest('header')).not.toBe(
      screen.getByRole('heading', { level: 1 }).closest('header')
    );
    expect(locationHeading).toHaveTextContent('0 ISK');
    const total = within(locationHeading).getByTestId('assets-total-value');
    expect(total).toHaveClass('text-sm');
    expect(locationHeading).not.toHaveClass('text-sm');
    expect(screen.queryByText(/Total value/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\(filtered\)/)).not.toBeInTheDocument();

    await openLocation(user, JITA);
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(
      screen
        .queryAllByRole('heading', { level: 2 })
        .some((el) => /locations? ·/.test(el.textContent ?? ''))
    ).toBe(false);
  });

  it('moves focus to the level heading on drill-in, and back to the root heading on Back (issue #1485)', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await openLocation(user, JITA);

    const levelHeading = await screen.findByRole('heading', {
      name: new RegExp(escapeRegExp(JITA)),
    });
    expect(levelHeading).toHaveFocus();

    await goBack(user);

    const rootHeading = await screen.findByRole('heading', { name: /location/i });
    expect(rootHeading).toHaveFocus();
  });

  it('resolves a solar-system location to its name instead of a raw system id', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        if (page === '2') return HttpResponse.json(assetPage2, { headers: { 'X-Pages': '2' } });
        return HttpResponse.json(
          [
            ...assetPage1,
            {
              item_id: 3,
              type_id: 650,
              quantity: 1,
              location_id: 30003889,
              location_type: 'solar_system' as const,
              location_flag: 'Hangar',
              is_singleton: true,
            },
          ],
          { headers: { 'X-Pages': '2' } }
        );
      }),
      http.get('https://esi.evetech.net/universe/systems/30003889', () =>
        HttpResponse.json({ system_id: 30003889, name: 'Amamake', security_status: 0.3 })
      )
    );

    render(<App />);

    expect(await screen.findByText('In space (Amamake)')).toBeInTheDocument();
  });

  it('labels a container/ship parent with its resolved type name instead of a raw item id', async () => {
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
    expect(await screen.findByRole('heading', { name: 'Drake' })).toBeInTheDocument();
  });

  it('falls back to the generic "Container" label when the parent item is unresolvable, and files it under Location unresolved', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            {
              item_id: 20,
              type_id: 34,
              quantity: 50,
              location_id: 999999999,
              location_type: 'item' as const,
              location_flag: 'Cargo',
              is_singleton: false,
            },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      ),
      // The missing parent isn't a real structure either — the best-effort
      // structure lookup 403s, same as any other structure the character
      // can't see into, and the group stays a genuine orphan.
      http.get('https://esi.evetech.net/universe/structures/999999999', () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
      )
    );
    render(<App />);
    expect(await screen.findByText(/Location unresolved/)).toBeInTheDocument();
    expect(screen.getByText('Container')).toBeInTheDocument();
  });

  it('resolves a missing parent to its real name when it turns out to be a structure ESI can still look up (e.g. a personal-hangar division ESI never returns its own asset row for)', async () => {
    const HANGAR_STRUCTURE = 'Badivefi - Tycho Brahe 18 HQ';
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            {
              item_id: 21,
              type_id: 653,
              quantity: 1,
              location_id: 1053725032929,
              location_type: 'item' as const,
              location_flag: 'Hangar',
              is_singleton: true,
            },
          ],
          { headers: { 'X-Pages': '1' } }
        )
      ),
      http.get('https://esi.evetech.net/universe/structures/1053725032929', () =>
        HttpResponse.json({
          name: HANGAR_STRUCTURE,
          owner_id: 1,
          solar_system_id: 30000144,
        })
      )
    );
    render(<App />);
    expect(await screen.findByText(HANGAR_STRUCTURE)).toBeInTheDocument();
    expect(screen.queryByText(/Location unresolved/)).not.toBeInTheDocument();
    expect(screen.queryByText('Container')).not.toBeInTheDocument();
  });

  it('filters items via the search box, across every location at once', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText(JITA);
    await user.type(screen.getByPlaceholderText(/search items/i), 'pyerite');
    // Search is debounced (issue #415) — wait it out rather than reading
    // results synchronously right after typing, same convention as
    // SkillPicker.test.tsx.
    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();
  });

  it('clearing the search returns to the root location list', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText(JITA);

    const search = screen.getByPlaceholderText(/search items/i);
    const pinButton = new RegExp(`More actions for ${escapeRegExp(JITA)}`);
    await user.type(search, 'tritanium');
    // A search result links to its location too, so its own text legitimately
    // includes "Jita IV…" — the root list's pin button is what only the root
    // list renders, so its absence is the real signal here.
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: pinButton })).not.toBeInTheDocument();

    await user.clear(search);
    expect(await screen.findByRole('button', { name: pinButton })).toBeInTheDocument();
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();
  });

  it('falls back to cached data offline', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'assets',
      value: assetPage1,
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () => HttpResponse.error())
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);
    expect(await screen.findByText(/showing cached data/i)).toBeInTheDocument();
    await openLocation(user, JITA);
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
  });

  it('keeps the saved assets on screen, with a small log-in note, when the assets grant lapsed over them', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'assets',
      value: assetPage1,
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);
    expect(await screen.findByText('Log in again to refresh.')).toBeInTheDocument();
    expect(screen.queryByText('Log in again to see your assets')).not.toBeInTheDocument();
    await openLocation(user, JITA);
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
  });

  it('warns that the list is incomplete when a page fails mid-pagination (D4)', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        if (page === '2') return new HttpResponse(null, { status: 404 });
        return HttpResponse.json(assetPage1, { headers: { 'X-Pages': '2' } });
      })
    );
    render(<App />);
    expect(await screen.findByText(/incomplete data/i)).toBeInTheDocument();
  });

  it('shows no incomplete-data warning when every page came back', async () => {
    render(<App />);
    await screen.findByText(JITA);
    expect(screen.queryByText(/incomplete data/i)).not.toBeInTheDocument();
  });

  it('shows the empty state when there is no data at all', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () => HttpResponse.error())
    );
    render(<App />);
    expect(await screen.findByText(/no assets cached/i)).toBeInTheDocument();
    expect(screen.queryByText('Total value')).not.toBeInTheDocument();
  });

  it('shows a re-login prompt (not a silent empty state) when the assets scope was revoked', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);
    expect(await screen.findByText('Log in again to see your assets')).toBeInTheDocument();
    expect(screen.queryByText(/no assets cached/i)).not.toBeInTheDocument();
  });

  it('notes inline that jumps away are unavailable when the location scope was never granted (#1590)', async () => {
    render(<App />);
    expect(await screen.findByText(JITA)).toBeInTheDocument();
    const note = (await screen.findByText('Jumps away unavailable')).closest('div');
    expect(note).not.toBeNull();
    // Scoped: the standings scope is also missing in this fixture, so the
    // shell's own GrantNote renders a second, identically-labelled button.
    expect(
      within(note as HTMLElement).getByRole('button', { name: 'Grant Character details' })
    ).toBeInTheDocument();
  });

  it('omits the jumps-away note once the location scope is granted (#1590)', async () => {
    await db.tokens.update(CHAR_ID, {
      scopes: ['esi-assets.read_assets.v1', 'esi-location.read_location.v1'],
    });
    render(<App />);
    expect(await screen.findByText(JITA)).toBeInTheDocument();
    expect(screen.queryByText('Jumps away unavailable')).not.toBeInTheDocument();
  });

  it('caps what is fetched and says so, when a character has more asset pages than the fetch cap', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page')) || 1;
        return HttpResponse.json([{ ...assetPage1[0], item_id: page }], {
          headers: { 'X-Pages': '30' },
        });
      })
    );
    render(<App />);
    expect(await screen.findByText(/only the first 25 assets were fetched/i)).toBeInTheDocument();
  });

  it('the truncation notice has a retry action, not just a bare notice (issue #415)', async () => {
    let requestCount = 0;
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, ({ request }) => {
        requestCount += 1;
        const page = Number(new URL(request.url).searchParams.get('page')) || 1;
        return HttpResponse.json([{ ...assetPage1[0], item_id: page }], {
          headers: { 'X-Pages': '30' },
        });
      })
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText(/only the first 25 assets were fetched/i);
    // The notice shows with the rows, before names and values finish; the
    // button is disabled until that load settles.
    const retry = screen.getByRole('button', { name: 'Try again' });
    await waitFor(() => expect(retry).toBeEnabled());
    const requestsBeforeRetry = requestCount;

    await user.click(retry);

    await waitFor(() => expect(requestCount).toBeGreaterThan(requestsBeforeRetry));
  });

  it('virtualizes a large asset list, rendering far fewer rows than exist (issue #86)', async () => {
    const bigAssetList = Array.from({ length: 2000 }, (_, i) => ({
      item_id: i + 1,
      type_id: 34,
      quantity: 1,
      location_id: 60003760,
      location_type: 'station' as const,
      location_flag: 'Hangar',
      is_singleton: false,
    }));
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(bigAssetList, { headers: { 'X-Pages': '1' } })
      )
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await openLocation(user, JITA);
    // The jsdom scroll-container shim reports a fixed ~600px viewport at ~48px/row —
    // nowhere near the 2000 rows that exist, proving the virtualizer is windowing
    // rather than rendering everything.
    const rendered = await screen.findAllByText('Tritanium');
    expect(rendered.length).toBeLessThan(100);
  });

  it('shows the fetch-cap notice without a render-cap notice, now that rendering is virtualized', async () => {
    const PAGE_SIZE = 50;
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page')) || 1;
        const pageItems = Array.from({ length: PAGE_SIZE }, (_, i) => ({
          ...assetPage1[0],
          item_id: (page - 1) * PAGE_SIZE + i + 1,
        }));
        return HttpResponse.json(pageItems, { headers: { 'X-Pages': '30' } });
      })
    );
    render(<App />);
    expect(await screen.findByText(/only the first 1250 assets were fetched/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Showing \d+ of \d+ assets\.$/)).not.toBeInTheDocument();
  });

  it('sorts sibling items alphabetically within a location, regardless of ESI response order', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json(
          [
            { ...assetPage1[0], item_id: 1, type_id: 34 }, // Tritanium
            { ...assetPage1[0], item_id: 2, type_id: 35 }, // Pyerite
          ],
          { headers: { 'X-Pages': '1' } }
        )
      )
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await openLocation(user, JITA);
    await screen.findByText('Tritanium');
    const names = screen.getAllByText(/^(Tritanium|Pyerite)$/).map((el) => el.textContent);
    expect(names).toEqual(['Pyerite', 'Tritanium']);
  });

  it('shows the singular "item" form of a container badge when it holds exactly one', async () => {
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
              quantity: 1,
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
    expect(screen.getByText('1 item · 0 ISK')).toBeInTheDocument();
  });

  it('still renders cached assets when global market prices are unreachable', async () => {
    server.use(http.get('https://esi.evetech.net/markets/prices', () => HttpResponse.error()));
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await openLocation(user, JITA);
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    await goBack(user);
    await openLocation(user, STRUCTURE);
    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
  });

  it('nests a ship into named sub-bays, each a further level to drill into, with a nested-item badge', async () => {
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
    expect(screen.getByText('50 items · 0 ISK')).toBeInTheDocument();
    expect(screen.queryByText('Cargo Hold')).not.toBeInTheDocument();
    // The ship row's menu offers where it sits (Set waypoint) and its name; "Open in Fittings" lives in the opened ship's header.
    await user.click(screen.getByRole('button', { name: 'More actions for Drake' }));
    // The menu re-renders once its station lookup lands, so each assertion
    // re-queries instead of holding an item the re-render may have replaced.
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: /set waypoint/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Copy name' })).toBeInTheDocument();
    });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Open in Fittings' })).not.toBeInTheDocument();

    await openLocation(user, 'Drake');
    expect(await screen.findByText('Cargo Hold')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open in Fittings' })).toBeInTheDocument();
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();

    await openLocation(user, 'Cargo Hold');
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    // A bay is not a ship: no shortcut there.
    expect(screen.queryByRole('button', { name: 'Open in Fittings' })).not.toBeInTheDocument();

    // Back walks up exactly one level per press: Cargo Hold -> Drake -> the
    // station's own contents -> the root list.
    await goBack(user); // now at Drake: its row is Cargo Hold
    expect(await screen.findByText('Cargo Hold')).toBeInTheDocument();
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();

    await goBack(user); // now at the station: its row is Drake
    expect(await screen.findByRole('heading', { name: 'Drake' })).toBeInTheDocument();
    expect(screen.queryByText('Cargo Hold')).not.toBeInTheDocument();

    await goBack(user); // now at the root list
    expect(
      await screen.findByRole('link', { name: new RegExp(escapeRegExp(JITA)) })
    ).toBeInTheDocument();
  });

  it('reports an unresolved bookmark rather than silently landing on the root', async () => {
    // A stale bookmark into a container that no longer has that item —
    // navigated straight to, not reached via in-app links.
    window.history.pushState({}, '', '/assets/items/60003760/i:999');
    const user = userEvent.setup({ delay: null });
    render(<App />);
    expect(await screen.findByText('This location is gone')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to all locations' }));
    expect(await screen.findByText(JITA)).toBeInTheDocument();
  });
});

describe('abyssal modules', () => {
  it('values an abyssal module at its MutaMarket estimate and credits MutaMarket once', async () => {
    abyssalEstimate.mockResolvedValue({
      status: 'priced',
      value: 90_000_000,
      source: 'mutamarket',
      fetchedAt: Date.now(),
      valueUpdatedAt: null,
      url: 'https://mutamarket.com/modules/x',
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json([
          ...assetPage1,
          {
            item_id: 1054645434634,
            type_id: ABYSSAL_NEUT,
            quantity: 1,
            location_id: 60003760,
            location_type: 'station' as const,
            location_flag: 'Hangar',
            is_singleton: true,
          },
        ])
      )
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);
    expect(
      await screen.findByText("1 abyssal module at MutaMarket's estimate", undefined, {
        timeout: 3000,
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Price from MutaMarket/ })).toHaveAttribute(
      'href',
      'https://mutamarket.com'
    );
    expect(screen.getByTestId('assets-total-value')).toHaveTextContent('90,000,000');
    expect(abyssalEstimate).toHaveBeenCalledWith(ABYSSAL_NEUT, 1054645434634, {
      characterId: CHAR_ID,
    });

    await openLocation(user, JITA);
    expect(await screen.findByText('Heavy Abyssal Energy Neutralizer')).toBeInTheDocument();
    expect(screen.getByTestId('abyssal-value-note')).toBeInTheDocument();
  });
});

/** Opens a location row's ⋮ menu and picks its pin item (the pin lives in the row menu). */
async function pinViaMenu(user: ReturnType<typeof userEvent.setup>, place: string, item: RegExp) {
  await user.click(
    await screen.findByRole('button', {
      name: new RegExp(`More actions for ${escapeRegExp(place)}`),
    })
  );
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

describe('station pins (issue #84)', () => {
  it('cycles a location pin unpinned -> character -> account -> unpinned, persisting to Dexie', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText(JITA);

    await pinViaMenu(user, JITA, /pin for this character/i);
    await waitFor(async () => {
      expect(await db.stationPins.get(`${CHAR_ID}:60003760`)).toMatchObject({
        characterId: CHAR_ID,
        locationId: 60003760,
        scope: 'character',
      });
    });

    await pinViaMenu(user, JITA, /pin for all characters/i);
    await waitFor(async () => {
      expect((await db.stationPins.get(`${CHAR_ID}:60003760`))?.scope).toBe('account');
    });

    await pinViaMenu(user, JITA, /^unpin$/i);
    await waitFor(async () => {
      expect(await db.stationPins.get(`${CHAR_ID}:60003760`)).toBeUndefined();
    });
  });

  it('sorts a pinned location to the top of the list, regardless of its label', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText(JITA);
    expect(locationOrder()).toEqual([JITA, STRUCTURE]);

    await pinViaMenu(user, STRUCTURE, /pin for this character/i);

    await waitFor(() => {
      expect(locationOrder()).toEqual([STRUCTURE, JITA]);
    });
  });

  it('a pin scoped to a different character does not elevate the location for the active one', async () => {
    await db.stationPins.put({
      id: `999:1000000000001`,
      characterId: 999,
      locationId: 1000000000001,
      scope: 'character',
      updatedAt: Date.now(),
    });
    render(<App />);
    await screen.findByText(JITA);
    expect(locationOrder()).toEqual([JITA, STRUCTURE]);
  });

  it('an account-wide pin elevates the location for every character', async () => {
    await db.stationPins.put({
      id: `999:1000000000001`,
      characterId: 999,
      locationId: 1000000000001,
      scope: 'account',
      updatedAt: Date.now(),
    });
    render(<App />);
    await screen.findByText(JITA);
    await waitFor(() => {
      expect(locationOrder()).toEqual([STRUCTURE, JITA]);
    });
  });
});

describe('item name and blueprint badge', () => {
  it('links the item name to its Show info (Item Detail)', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await openLocation(user, JITA);

    const name = await screen.findByRole('link', { name: 'Tritanium' });
    expect(name.getAttribute('href')).toMatch(/info=type-34$/);
    expect(name).not.toHaveAttribute('title');
  });

  it('keeps right-click on the name opening the row menu, not Show info', async () => {
    render(<App />);
    const user = userEvent.setup({ delay: null });
    await openLocation(user, JITA);
    const name = await screen.findByRole('link', { name: 'Tritanium' });
    fireEvent.contextMenu(name);

    expect(screen.getByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Item detail: Tritanium' })).toBeNull();
    await user.keyboard('{Escape}');
  });

  it('badges a blueprint original as BPO once the blueprint set loads', async () => {
    const { loadBlueprints } = await import('@/sde/loadSde');
    vi.mocked(loadBlueprints).mockResolvedValue({
      '691': {
        name: 'Rifter Blueprint',
        time: 6000,
        materials: [],
        products: [{ typeID: 587, quantity: 1 }],
        skills: [],
        activity: 'manufacturing',
      },
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json([
          ...assetPage1,
          { ...assetPage1[0], item_id: 3, type_id: 691, quantity: 1 },
        ])
      )
    );
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await openLocation(user, JITA);

    const badge = (await screen.findByText('Blueprint original')).parentElement;
    expect(badge).toHaveTextContent('BPO');
    expect(screen.getAllByText(/^Blueprint (original|copy)$/)).toHaveLength(1);
    vi.mocked(loadBlueprints).mockResolvedValue({});
  });
});
