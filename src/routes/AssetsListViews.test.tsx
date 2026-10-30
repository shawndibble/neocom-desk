import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { db } from '@/db';
import { App } from '@/app/App';
import { exportRows } from '@/lib/downloadCsv';
import {
  CHAR_ID,
  JITA,
  STRUCTURE,
  server,
  installAssetsHarness,
  clickTool,
  downloadCsv,
  openLocation,
  locationOrder,
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

describe('item context menu (issue #83)', () => {
  it('opens the same menu from a visible More actions button on the row (#1497)', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await openLocation(user, JITA);

    await user.click(await screen.findByRole('button', { name: 'More actions for Tritanium' }));

    expect(await screen.findByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'View in Market' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Copy name' })).toBeInTheDocument();
  });

  it('opens the shared item context menu on right-click, with a View in Market action', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await openLocation(user, JITA);
    const item = await screen.findByText('Tritanium');
    item.focus();
    fireEvent.contextMenu(item);

    expect(screen.getByRole('menuitem', { name: 'Add to Quickbar' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Add to Compare' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'View in Market' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Copy name' })).toBeInTheDocument();
    expect(
      await screen.findByRole('menuitem', { name: 'No blueprint options' }, { timeout: 2000 })
    ).toBeInTheDocument();

    await user.keyboard('{Escape}');
  });

  it('adds an item to the Quickbar from the Assets context menu, persisting to Dexie', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await openLocation(user, JITA);
    const item = await screen.findByText('Tritanium');
    item.focus();
    fireEvent.contextMenu(item);

    await user.click(screen.getByRole('menuitem', { name: 'Add to Quickbar' }));

    await waitFor(async () => {
      const record = await db.quickbars.get(String(CHAR_ID));
      expect(record?.items).toEqual([{ typeId: 34, name: 'Tritanium' }]);
    });
  });

  it('navigates to the Market Browser with the item preselected via View in Market', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await openLocation(user, JITA);
    const item = await screen.findByText('Tritanium');
    item.focus();
    fireEvent.contextMenu(item);

    await user.click(screen.getByRole('menuitem', { name: 'View in Market' }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/market/browser');
    });
    expect(window.location.search).toContain('type=34');
  });

  it('offers "View in Industry as material" when an owned Build Plan consumes the item, and jumps to Industry', async () => {
    const user = userEvent.setup({ delay: null });
    const { loadBlueprints } = await import('@/sde/loadSde');
    vi.mocked(loadBlueprints).mockResolvedValueOnce({
      '9999': {
        name: 'Widget Blueprint',
        time: 100,
        materials: [{ typeID: 34, quantity: 10 }],
        products: [{ typeID: 9998, quantity: 1 }],
        skills: [],
        activity: 'manufacturing',
      },
    });
    await db.buildPlans.add({
      id: 'bp-1',
      characterId: CHAR_ID,
      name: 'Widget run',
      blueprintTypeID: 9999,
      runs: 1,
      me: 0,
      te: 0,
      facility: 'npcStation',
      rigLevel: 'none',
      security: 'highsec',
      hubId: 'jita',
      updatedAt: 1,
    });
    render(<App />);
    await openLocation(user, JITA);
    const item = await screen.findByText('Tritanium');
    item.focus();
    fireEvent.contextMenu(item);

    const action = await screen.findByRole('menuitem', { name: 'View in Industry as material' });
    await user.click(action);

    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans'));
  });

  it('omits "View in Industry as material" when no owned Build Plan consumes the item', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await openLocation(user, JITA);
    const item = await screen.findByText('Tritanium');
    item.focus();
    fireEvent.contextMenu(item);

    await screen.findByRole('menuitem', { name: 'No blueprint options' });
    expect(
      screen.queryByRole('menuitem', { name: 'View in Industry as material' })
    ).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
  });
});

describe('all items view, min-value filter, and sort (issue #414)', () => {
  beforeEach(() => {
    server.use(
      http.get('https://esi.evetech.net/markets/prices', () =>
        HttpResponse.json([
          { type_id: 34, average_price: 5 }, // Tritanium stack: 500 x 5 = 2,500 ISK
          { type_id: 35, average_price: 5000 }, // Pyerite stack: 10 x 5,000 = 50,000 ISK
        ])
      )
    );
  });

  it('shows every item across every location, without drilling in, once toggled on', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText(JITA);
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();

    await clickTool(user, 'All items');

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByText('Pyerite')).toBeInTheDocument();
  });

  it('hides items below the minimum value threshold', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText(JITA);
    await clickTool(user, 'All items');
    await screen.findByText('Tritanium');

    await user.type(screen.getByLabelText('Minimum value'), '10000');

    await waitFor(() => expect(screen.queryByText('Tritanium')).not.toBeInTheDocument());
    expect(screen.getByText('Pyerite')).toBeInTheDocument();
  });

  it('keeps rows visible under a min-value filter while prices are still loading', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('https://esi.evetech.net/markets/prices', async () => {
        await gate;
        return HttpResponse.json([{ type_id: 35, average_price: 5000 }]);
      })
    );
    window.history.replaceState({}, '', '/assets?all=1&min=10000');
    render(<App />);

    // Prices parked: every stack values 0, which the filter must not read as "below the minimum".
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();

    release();
    await waitFor(() => expect(screen.queryByText('Tritanium')).not.toBeInTheDocument());
    expect(screen.getByText('Pyerite')).toBeInTheDocument();
  });

  describe('CSV export honours the min-value filter (issue #2840)', () => {
    async function exportCsv() {
      vi.mocked(exportRows).mockClear();
      const user = userEvent.setup({ delay: null });
      await downloadCsv(user);
      await waitFor(() => expect(exportRows).toHaveBeenCalledTimes(1));
      return JSON.stringify(vi.mocked(exportRows).mock.calls[0][2]);
    }

    it('leaves out stacks below the minimum in the All items view', async () => {
      window.history.replaceState({}, '', '/assets?all=1&min=10000');
      render(<App />);
      await screen.findByText('Pyerite');

      const rows = await exportCsv();
      expect(rows).toContain('Pyerite');
      expect(rows).not.toContain('Tritanium');
    });

    it('filters nothing while prices are still loading', async () => {
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      server.use(
        http.get('https://esi.evetech.net/markets/prices', async () => {
          await gate;
          return HttpResponse.json([{ type_id: 35, average_price: 5000 }]);
        })
      );
      window.history.replaceState({}, '', '/assets?all=1&min=10000');
      render(<App />);
      await screen.findByText('Tritanium');

      const rows = await exportCsv();
      expect(rows).toContain('Tritanium');
      expect(rows).toContain('Pyerite');
      release();
    });

    it('leaves out stacks below the minimum in the tree view too (issue #5601)', async () => {
      window.history.replaceState({}, '', '/assets?min=10000');
      render(<App />);
      await screen.findByText(STRUCTURE);
      // Jita holds only the Tritanium stack, which is under the minimum.
      expect(screen.queryByText(JITA)).not.toBeInTheDocument();

      const rows = await exportCsv();
      expect(rows).toContain('Pyerite');
      expect(rows).not.toContain('Tritanium');
    });
  });

  it('takes ISK shorthand in the minimum value, with no echo line in the strip (issue #2227)', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText(JITA);
    await clickTool(user, 'All items');
    await screen.findByText('Tritanium');

    await user.type(screen.getByLabelText('Minimum value'), '10t');

    await waitFor(() => expect(screen.queryByText('Tritanium')).not.toBeInTheDocument());
    expect(screen.getByText('Pyerite')).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toContain('min=10000'));
    expect(screen.queryByText(/= 10,000 ISK/)).not.toBeInTheDocument();
  });

  it('sorts the flat list by value, highest first', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText(JITA);
    await clickTool(user, 'All items');
    await screen.findByText('Tritanium');

    await user.click(screen.getByLabelText('Sort'));
    await user.click(await screen.findByRole('option', { name: 'Value' }));

    const names = screen.getAllByText(/^(Tritanium|Pyerite)$/).map((el) => el.textContent);
    expect(names).toEqual(['Pyerite', 'Tritanium']);
  });

  /**
   * Silent persistence, like the location list's own sort: the flat list is
   * the same list every visit, and re-choosing "Value" on each one is the
   * page forgetting something the user already told it. The min-value box
   * beside it stays per-visit on purpose — see `assetSortPreference.ts`.
   */
  it('remembers the flat list sort across a remount', async () => {
    const user = userEvent.setup({ delay: null });
    const { unmount } = render(<App />);
    await screen.findByText(JITA);
    await clickTool(user, 'All items');
    await screen.findByText('Tritanium');

    await user.click(screen.getByLabelText('Sort'));
    await user.click(await screen.findByRole('option', { name: 'Value' }));
    unmount();
    // A fresh visit: All Items rides the URL, the sort does not.
    window.history.replaceState({}, '', '/assets');

    render(<App />);
    await screen.findByText(JITA);
    await clickTool(user, 'All items');
    await screen.findByText('Tritanium');

    await waitFor(() => {
      expect(screen.getByLabelText('Sort')).toHaveTextContent('Value');
    });
    const names = screen.getAllByText(/^(Tritanium|Pyerite)$/).map((el) => el.textContent);
    expect(names).toEqual(['Pyerite', 'Tritanium']);
  });

  it('keeps the minimum-value threshold in the URL only — a fresh visit starts without it', async () => {
    const user = userEvent.setup({ delay: null });
    const { unmount } = render(<App />);
    await screen.findByText(JITA);
    await clickTool(user, 'All items');
    await screen.findByText('Tritanium');

    await user.type(screen.getByLabelText('Minimum value'), '10000');
    await waitFor(() => expect(screen.queryByText('Tritanium')).not.toBeInTheDocument());
    await waitFor(() => expect(window.location.search).toContain('min=10000'));
    unmount();
    window.history.replaceState({}, '', '/assets');

    render(<App />);
    await screen.findByText(JITA);
    await clickTool(user, 'All items');

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByLabelText('Minimum value')).toHaveValue('');
  });

  it('applies the same min-value filter and sort to active search results', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText(JITA);
    await user.type(screen.getByPlaceholderText(/search items/i), 'i');
    await screen.findByText('Tritanium');

    await user.type(screen.getByLabelText('Minimum value'), '10000');

    await waitFor(() => expect(screen.queryByText('Tritanium')).not.toBeInTheDocument());
    expect(screen.getByText('Pyerite')).toBeInTheDocument();
  });
});

describe('location sort (issue #88)', () => {
  // Default fixture: Jita holds 500 Tritanium (type 34), the structure holds
  // 10 Pyerite (type 35) — pricing Pyerite far above Tritanium makes the
  // structure's estimated value the larger one while its name still sorts
  // after Jita's, so a switch to "Value" is only visible if sorting actually
  // changed rather than leaving the default alphabetical order in place.
  function priceStructureAboveJita() {
    server.use(
      http.get('https://esi.evetech.net/markets/prices', () =>
        HttpResponse.json([
          { type_id: 34, adjusted_price: 1, average_price: 1 },
          { type_id: 35, adjusted_price: 10_000, average_price: 10_000 },
        ])
      )
    );
  }

  it('defaults to sorting locations by name', async () => {
    render(<App />);
    await screen.findByText(JITA);
    expect(locationOrder()).toEqual([JITA, STRUCTURE]);
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveTextContent('Name');
  });

  it('shows the Route picker, left of Sort, only under the "Jumps away" sort', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText(JITA);
    expect(screen.queryByRole('combobox', { name: 'Route' })).not.toBeInTheDocument();

    const sort = screen.getByRole('combobox', { name: 'Sort' });
    await user.click(sort);
    await user.click(await screen.findByRole('option', { name: 'Jumps away' }));

    const route = await screen.findByRole('combobox', { name: 'Route' });
    expect(route.compareDocumentPosition(sort) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(sort);
    await user.click(await screen.findByRole('option', { name: 'Name' }));
    await waitFor(() => {
      expect(screen.queryByRole('combobox', { name: 'Route' })).not.toBeInTheDocument();
    });
  });

  it('re-sorts the location list by estimated value when "Value" is selected', async () => {
    const user = userEvent.setup({ delay: null });
    priceStructureAboveJita();
    render(<App />);
    await screen.findByText(JITA);
    expect(locationOrder()).toEqual([JITA, STRUCTURE]);

    await user.click(screen.getByRole('combobox', { name: 'Sort' }));
    await user.click(await screen.findByRole('option', { name: 'Value' }));

    await waitFor(() => {
      expect(locationOrder()).toEqual([STRUCTURE, JITA]);
    });
  });

  it('keeps a pinned location on top even under a "Value" sort it would otherwise lose', async () => {
    const user = userEvent.setup({ delay: null });
    priceStructureAboveJita();
    await db.stationPins.put({
      id: `${CHAR_ID}:60003760`,
      characterId: CHAR_ID,
      locationId: 60003760,
      scope: 'character',
      updatedAt: Date.now(),
    });
    render(<App />);
    await screen.findByText(JITA);

    await user.click(screen.getByRole('combobox', { name: 'Sort' }));
    await user.click(await screen.findByRole('option', { name: 'Value' }));

    await waitFor(() => {
      expect(locationOrder()).toEqual([JITA, STRUCTURE]);
    });
  });

  it('persists the chosen sort field across a remount', async () => {
    const user = userEvent.setup({ delay: null });
    priceStructureAboveJita();
    const { unmount } = render(<App />);
    await screen.findByText(JITA);

    await user.click(screen.getByRole('combobox', { name: 'Sort' }));
    await user.click(await screen.findByRole('option', { name: 'Value' }));
    await waitFor(() => {
      expect(locationOrder()).toEqual([STRUCTURE, JITA]);
    });
    unmount();

    render(<App />);
    await screen.findByText(JITA);
    await waitFor(() => {
      expect(locationOrder()).toEqual([STRUCTURE, JITA]);
    });
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveTextContent('Value');
  });
});

describe('Asset Category filter (issue #5601)', () => {
  it('shows the empty state with Reset filters when no category is ticked, and Reset brings everything back', async () => {
    const user = userEvent.setup({ delay: null });
    window.history.replaceState({}, '', '/assets/items?cat=');
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Reset filters' }));

    expect(await screen.findByText(JITA)).toBeInTheDocument();
    expect(window.location.search).not.toContain('cat=');
  });

  it('lists the stations whose items are ticked', async () => {
    // An empty catalogue puts every type under "Not on the market" (id -1).
    window.history.replaceState({}, '', '/assets/items?cat=-1');
    render(<App />);

    expect(await screen.findByText(JITA)).toBeInTheDocument();
    expect(screen.getByText(STRUCTURE)).toBeInTheDocument();
  });
});
