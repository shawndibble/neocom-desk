import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { useMarketHub } from '@/features/market/hub';
import { useMarketBrowserHub } from '@/features/market/browserHub';
import { useMarketPricePercent } from '@/features/market/pricePercent';
import { appraisePaste } from '@/features/market/appraisalData';
import { Market } from './Market';
import type { MarketGroupNode, MarketTypeEntry } from '@/sde/marketTypes';

const GROUPS: MarketGroupNode[] = [{ id: 18, name: 'Minerals', parentId: null, hasTypes: true }];
const TYPES: MarketTypeEntry[] = [{ typeId: 34, name: 'Tritanium', marketGroupId: 18 }];

vi.mock('@/sde/loadSde', () => ({
  loadBlueprints: vi.fn(async () => ({})),
  loadTypes: vi.fn(async () => ({})),
  loadSkills: vi.fn(async () => []),
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
}));

vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketGroups: vi.fn(async () => GROUPS),
  loadMarketTypes: vi.fn(async () => TYPES),
  loadNpcStations: vi.fn(async () => []),
  loadSolarSystems: vi.fn(async () => []),
  loadMarketRegions: vi.fn(async () => []),
  loadGlobalMarkets: vi.fn(async () => []),
  loadVariations: vi.fn(async () => ({ types: {}, metaGroups: {} })),
  loadAttributeDictionary: vi.fn(async () => ({})),
}));

// Nothing here appraises: these tests are about the page's own navigation.
vi.mock('@/features/market/appraisalData', () => ({
  appraisePaste: vi.fn(async () => ({
    appraisal: { rows: [], totals: { buy: 0, sell: 0, spread: 0, unpricedRows: 0 } },
    unmatched: [],
    implantBonusPct: 0,
    refinesOreOrIce: false,
    accountingLevel: null,
    brokerRelationsLevel: null,
  })),
  compareHubs: vi.fn(async () => []),
  loadAppraisalCatalogue: vi.fn(async () => new Map()),
  clearAppraisalCatalogue: vi.fn(),
}));

// Recording the URL is exactly what an effect is for — writing the latest
// React state out to something outside React. Doing it during render trips
// `react-hooks/globals` / `react-hooks/immutability`, and rightly so.
const probe = { pathname: '', search: '' };
function LocationProbe() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    probe.pathname = pathname;
    probe.search = search;
  }, [pathname, search]);
  return null;
}

function renderAt(entry: string) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Market />
      <LocationProbe />
    </MemoryRouter>
  );
}

async function pickHub(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: /Trade Hub/i }));
  await user.click(await screen.findByRole('option', { name }));
}

beforeEach(async () => {
  probe.pathname = '';
  probe.search = '';
  // The page reads its hub from `useMarketBrowserHub`, a Dexie-backed store
  // like `useMarketHub`, so picking one writes it to Dexie as well as to the
  // store. Resetting only the store leaves the row behind, and the next
  // test's `hydrateHub()` reads it back asynchronously — landing on the hub
  // the previous test picked, which makes picking that hub again a no-op
  // firing no `onValueChange` at all.
  await db.settings.clear();
  useMarketHub.setState({ value: 'jita', hydrated: false });
  useMarketBrowserHub.setState({ value: 'jita', hydrated: false });
  useMarketPricePercent.setState({ value: 100, hydrated: false });
});

describe('Market Appraisal tab navigation', () => {
  it('offers the trade hub picker but not the Location Mode chips', async () => {
    renderAt('/market/appraisal');

    expect(await screen.findByRole('combobox', { name: /Trade Hub/i })).toBeInTheDocument();
    // Region has no meaning here: prices come from one station's aggregates.
    expect(screen.queryByRole('button', { name: /Region/i })).not.toBeInTheDocument();
  });

  /**
   * `navigateTo` replaces only `type`/`hub`/`region`/`group` — the tab is a
   * path segment now (ADR 0015), not a query param riding along, so there is
   * nothing left for it to carry across a hub change.
   */
  it('stays on the appraisal path when the hub changes', async () => {
    renderAt('/market/appraisal');
    await screen.findByRole('combobox', { name: /Trade Hub/i });

    await pickHub('Amarr');

    await waitFor(() => expect(probe.search).toContain('hub=amarr'));
    expect(probe.pathname).toBe('/market/appraisal');
  });

  it('stays on the tab when the hub changes with an item still in the URL', async () => {
    renderAt('/market/appraisal?type=34');
    await screen.findByRole('combobox', { name: /Trade Hub/i });
    expect(screen.getByText('Nothing appraised yet')).toBeInTheDocument();

    await pickHub('Amarr');

    await waitFor(() => expect(probe.search).toContain('hub=amarr'));
    expect(probe.pathname).toBe('/market/appraisal');
    expect(screen.getByText('Nothing appraised yet')).toBeInTheDocument();
  });

  /**
   * An appraised row's item link points at `/market/browser?type=…`
   * (`engine/market/urlState.ts`'s `marketItemUrl`) — a real path change, not
   * a query-only cross-link heuristic — so Market's own tab resolution just
   * follows the new pathname to the Browser like any other navigation.
   */
  it('opens an appraised item in the Browser when its name is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(appraisePaste).mockResolvedValueOnce({
      appraisal: {
        rows: [
          {
            typeId: 34,
            name: 'Tritanium',
            quantity: 5,
            buyEach: 4,
            sellEach: 6,
            buyTotal: 20,
            sellTotal: 30,
          },
        ],
        totals: {
          buy: 20,
          sell: 30,
          spread: 10,
          unpricedRows: 0,
          refine: 0,
          refineUnpricedRows: 0,
          cheapestBuy: 0,
          cheapestBuyViaLp: 0,
        },
        items: [],
      },
      unmatched: [],
      implantBonusPct: 0,
      refinesOreOrIce: false,
      accountingLevel: null,
      brokerRelationsLevel: null,
    });
    renderAt('/market/appraisal');

    await user.type(await screen.findByLabelText(/Items from inventory/), 'Tritanium 5');
    await user.click(screen.getByRole('button', { name: 'Appraise' }));

    await user.click(await screen.findByRole('link', { name: 'Tritanium' }));

    await waitFor(() => expect(probe.pathname).toBe('/market/browser'));
    expect(probe.search).toContain('type=34');
    // The Browser's own item view, not the paste box it was clicked from.
    expect(await screen.findByRole('tab', { name: 'Order Book' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Items from inventory/)).not.toBeInTheDocument();
  });
});
