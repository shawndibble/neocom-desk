import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { useGlobalClosest, useMarketHub } from '@/features/market/hub';
import { resetHubStores } from '@/test/hubStores';
import { usePageHubs } from '@/features/market/pageHubs';
import { useMarketPricePercent } from '@/features/market/pricePercent';
import { appraisePaste } from '@/features/market/appraisalData';
import { Market } from './Market';
import type { MarketGroupNode, MarketTypeEntry } from '@/sde/marketTypes';

const GROUPS: MarketGroupNode[] = [{ id: 18, name: 'Minerals', parentId: null, hasTypes: true }];
const TYPES: MarketTypeEntry[] = [{ typeId: 34, name: 'Tritanium', marketGroupId: 18, volume: 1 }];

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
    pricesUnreachable: false,
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
  const user = userEvent.setup({ delay: null });
  await user.click(screen.getByRole('button', { name: /Trade Hub/i }));
  await user.click(await screen.findByRole('button', { name }));
}

beforeEach(async () => {
  probe.pathname = '';
  probe.search = '';
  // The page reads its hub from the page hubs, a Dexie-backed store like
  // `useMarketHub`, so picking one writes it to Dexie as well as to the
  // store. Resetting only the store leaves the row behind, and the next
  // test's `hydrateHub()` reads it back asynchronously — landing on the hub
  // the previous test picked, which makes picking that hub again a no-op
  // firing no `onValueChange` at all.
  await db.settings.clear();
  resetHubStores();
  useMarketPricePercent.setState({ value: 100, hydrated: false });
});

describe('Market Appraisal tab navigation', () => {
  it('offers the trade hub picker but not the Location Mode chips', async () => {
    renderAt('/market/appraisal');

    expect(await screen.findByRole('button', { name: /Trade Hub/i })).toBeInTheDocument();
    // Region has no meaning here: prices come from one station's aggregates.
    expect(screen.queryByRole('button', { name: /Region/i })).not.toBeInTheDocument();
  });

  /**
   * Appraisal prices at its own page hub (issue #6523), apart from the hub the
   * Browser's URL names: a pick writes the hub, never the URL, and the tab
   * stays put.
   */
  it('a hub pick prices the Appraisal there and stays on the tab, leaving the URL alone', async () => {
    renderAt('/market/appraisal?type=34');
    await screen.findByRole('button', { name: /Trade Hub/i });
    expect(screen.getByText('Nothing appraised yet')).toBeInTheDocument();

    await pickHub('Amarr VIII');

    // Appraisal is on Global here, so the pick moves the Global hub.
    await waitFor(() => expect(useMarketHub.getState().value).toBe('amarr'));
    expect(probe.search).not.toContain('hub=');
    expect(probe.pathname).toBe('/market/appraisal');
    expect(screen.getByText('Nothing appraised yet')).toBeInTheDocument();
  });

  it("a link's ?hub= prices this visit's Appraisal there, never writing a hub", async () => {
    renderAt('/market/appraisal?hub=amarr');
    expect(await screen.findByRole('button', { name: /, Trade Hub$/ })).toHaveTextContent('Amarr');
    // Once page hubs are read (adoption runs after that), nothing was written.
    await waitFor(() => expect(usePageHubs.getState().hydrated).toBe(true));
    expect(usePageHubs.getState().value).toEqual({});
    expect(useMarketHub.getState().value).toBe('jita');
  });

  it('Closest picked on the Appraisal sticks, written once', async () => {
    renderAt('/market/appraisal');
    await screen.findByRole('button', { name: /Trade Hub/i });

    await pickHub('Closest hub');

    await waitFor(() => expect(useGlobalClosest.getState().value).toBe(true));
    // No location here, so Closest falls back to Global; the stored hub is untouched.
    expect(useMarketHub.getState().value).toBe('jita');
    expect(usePageHubs.getState().value).toEqual({});
  });

  it('with its own entry, an Appraisal pick moves only the Appraisal hub', async () => {
    await usePageHubs.getState().setValue({ appraisal: 'jita' });
    renderAt('/market/appraisal');
    await screen.findByRole('button', { name: /Trade Hub/i });

    await pickHub('Amarr VIII');

    await waitFor(() => expect(usePageHubs.getState().value.appraisal).toBe('amarr'));
    expect(useMarketHub.getState().value).toBe('jita');
  });

  /**
   * An appraised row's item link points at `/market/browser?type=…`
   * (`engine/market/urlState.ts`'s `marketItemUrl`) — a real path change, not
   * a query-only cross-link heuristic — so Market's own tab resolution just
   * follows the new pathname to the Browser like any other navigation.
   */
  it('opens an appraised item in the Browser when its name is clicked', async () => {
    const user = userEvent.setup({ delay: null });
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
            volume: null,
          },
        ],
        totals: {
          buy: 20,
          sell: 30,
          spread: 10,
          unpricedRows: 0,
          refine: 0,
          refineSell: 0,
          refineUnpricedRows: 0,
          cheapestBuy: 0,
          cheapestBuyViaLp: 0,
          volume: 0,
          volumeUnknownRows: 0,
        },
        items: [],
      },
      unmatched: [],
      implantBonusPct: 0,
      refinesOreOrIce: false,
      accountingLevel: null,
      brokerRelationsLevel: null,
      pricesUnreachable: false,
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
