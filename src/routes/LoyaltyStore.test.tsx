import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import '@/i18n';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
import { DESKTOP_QUERY } from '@/lib/useIsDesktop';
import { TRADE_HUBS } from '@/market/hubs';
import type { LoyaltyOfferRow } from '@/features/loyalty/offerRows';
import type { LoyaltyStoreOffer } from '@/esi/endpoints';

const useLoyaltyStoreOffers = vi.fn();
vi.mock('@/features/loyalty/useLoyaltyStoreOffers', () => ({
  useLoyaltyStoreOffers: (corporationId: number) => useLoyaltyStoreOffers(corporationId),
}));

const { LoyaltyStore } = await import('./LoyaltyStore');
const { useMarketHub } = await import('@/features/market/hub');
const { usePriceBasis } = await import('@/features/loyalty/priceBasis');

/**
 * Narrow, so the filters render inside the sheet. jsdom's stub never matches
 * (`vitest.setup.ts`), which `useIsNarrow` reads as a pointer viewport.
 */
let restoreMatchMedia: (() => void) | undefined;

function useNarrowViewport(): void {
  const real = window.matchMedia;
  window.matchMedia = (media: string) =>
    ({
      media,
      matches: media === NARROW_QUERY,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  restoreMatchMedia = () => {
    window.matchMedia = real;
  };
}

const OTHER_HUB = TRADE_HUBS.find((hub) => hub.id !== 'jita')!;

/** Opposite of `useNarrowViewport`: jsdom's stub never matches, so this is
 * what forces the desktop two-column layout in a test. */
function useDesktopViewport(): void {
  const real = window.matchMedia;
  window.matchMedia = (media: string) =>
    ({
      media,
      matches: media === DESKTOP_QUERY,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  restoreMatchMedia = () => {
    window.matchMedia = real;
  };
}

beforeEach(() => {
  useLoyaltyStoreOffers.mockReturnValue({
    corpName: 'Federal Navy Academy',
    offersFetchedAt: null,
    offersFromCache: false,
    rows: [],
    catalog: null,
    playerLp: 12_000,
    hub: TRADE_HUBS[0]!,
    ready: true,
    useOwnMaterialsFor: new Set<number>(),
    toggleUseOwnMaterials: () => {},
  });
  useMarketHub.setState({ value: 'jita' });
  usePriceBasis.setState({ value: 'sell' });
});

afterEach(() => {
  restoreMatchMedia?.();
  restoreMatchMedia = undefined;
  vi.clearAllMocks();
});

// Writing the latest router location out to something outside React, the
// same pattern Market.appraisal.test.tsx uses — reading it during render
// itself would trip `react-hooks/immutability`.
const probe = { pathname: '', search: '' };
function LocationProbe() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    probe.pathname = pathname;
    probe.search = search;
  }, [pathname, search]);
  return null;
}

function renderStore() {
  return render(
    <MemoryRouter initialEntries={['/loyalty/1000168']}>
      <Routes>
        <Route
          path="/loyalty/:corporationId"
          element={
            <>
              <LoyaltyStore />
              <LocationProbe />
            </>
          }
        />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

function offer(overrides: Partial<LoyaltyStoreOffer>): LoyaltyStoreOffer {
  return {
    isk_cost: 0,
    lp_cost: 100,
    offer_id: 1,
    quantity: 1,
    required_items: [],
    type_id: 1,
    ...overrides,
  };
}

const PROFIT = {
  revenue: 1000,
  salesTax: 75,
  brokerFee: 100,
  netRevenue: 825,
  profit: 500,
  iskPerLp: 5,
  affordableLp: true,
};

const ITEM_ROW: LoyaltyOfferRow = {
  offer: offer({ offer_id: 1, type_id: 200 }),
  itemName: 'Scourge Fury Heavy Missile',
  isBlueprint: false,
  productTypeId: null,
  productName: null,
  build: null,
  profit: PROFIT,
  requiredItems: [],
  requiredItemsCost: 0,
};

const BLUEPRINT_ROW: LoyaltyOfferRow = {
  offer: offer({ offer_id: 2, type_id: 999 }),
  itemName: 'Republic Fleet Firetail Blueprint',
  isBlueprint: true,
  productTypeId: 300,
  productName: 'Republic Fleet Firetail',
  build: null,
  profit: PROFIT,
  requiredItems: [],
  requiredItemsCost: 0,
};

const UNRESOLVED_BLUEPRINT_ROW: LoyaltyOfferRow = {
  offer: offer({ offer_id: 3, type_id: 998 }),
  itemName: 'Mystery Blueprint',
  isBlueprint: true,
  productTypeId: null,
  productName: null,
  build: null,
  profit: PROFIT,
  requiredItems: [],
  requiredItemsCost: 0,
};

describe('LoyaltyStore filters', () => {
  it('shows the filters inline on a pointer viewport', () => {
    renderStore();
    expect(screen.getByRole('combobox', { name: /Market hub/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Affordable/i })).toBeInTheDocument();
  });

  /**
   * The hub and the price basis are persisted preferences, so the mobile
   * sheet's Cancel would have a store write to undo if the control wrote as it
   * was changed. It must not: the draft stays local until Apply.
   */
  it('does not write the persisted trade hub until Apply', async () => {
    useNarrowViewport();
    const user = userEvent.setup();
    renderStore();

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.click(screen.getByRole('combobox', { name: /Market hub/i }));
    await user.click(screen.getByRole('option', { name: OTHER_HUB.systemName }));
    expect(useMarketHub.getState().value).toBe('jita');

    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(useMarketHub.getState().value).toBe(OTHER_HUB.id);
  });

  it('leaves the persisted trade hub alone when the sheet is cancelled', async () => {
    useNarrowViewport();
    const user = userEvent.setup();
    renderStore();

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.click(screen.getByRole('combobox', { name: /Market hub/i }));
    await user.click(screen.getByRole('option', { name: OTHER_HUB.systemName }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(useMarketHub.getState().value).toBe('jita');
  });

  it('commits the chip filters on Apply', async () => {
    useNarrowViewport();
    const user = userEvent.setup();
    renderStore();

    // "Affordable only" is on by default, so turning it off is one active filter.
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.click(screen.getByRole('button', { name: /Affordable/i }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(screen.getByRole('button', { name: /Affordable/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  /**
   * The three filters live in the URL now (issue #1302), so a reload or a
   * pasted link reopens the same filtered view.
   */
  it('leaves the query string empty on a plain visit — every filter still on its default', () => {
    renderStore();
    expect(probe.search).toBe('');
  });

  it('writes the affordable-only toggle to the URL, omitted again once it is back on', async () => {
    const user = userEvent.setup();
    renderStore();

    await user.click(screen.getByRole('button', { name: /Affordable/i }));
    await waitFor(() => expect(probe.search).toContain('affordableOnly=0'));

    await user.click(screen.getByRole('button', { name: /Affordable/i }));
    await waitFor(() => expect(probe.search).toBe(''));
  });

  it('keeps the search box text in the URL, so a reload reopens the same filtered view', async () => {
    const user = userEvent.setup();
    renderStore();

    await user.type(screen.getByPlaceholderText('Search offers'), 'plex');
    await waitFor(() => expect(probe.search).toContain('search=plex'));
  });
});

describe('LoyaltyStore selected offer (issue #1490)', () => {
  it('marks the selected row aria-current and announces the change, on desktop', async () => {
    useDesktopViewport();
    useLoyaltyStoreOffers.mockReturnValue({
      corpName: 'Federal Navy Academy',
      offersFetchedAt: null,
      offersFromCache: false,
      rows: [ITEM_ROW, BLUEPRINT_ROW],
      catalog: null,
      playerLp: 12_000,
      hub: TRADE_HUBS[0]!,
      ready: true,
      useOwnMaterialsFor: new Set<number>(),
      toggleUseOwnMaterials: () => {},
    });
    const user = userEvent.setup();
    renderStore();

    await user.click(screen.getByText(ITEM_ROW.itemName));

    expect(screen.getByRole('row', { name: new RegExp(ITEM_ROW.itemName) })).toHaveAttribute(
      'aria-current',
      'true'
    );
    // The desktop split panel repaints in place with no dialog to announce
    // it — a live region says so, the way the mobile sheet does implicitly.
    expect(screen.getByText(`Showing ${ITEM_ROW.itemName}`)).toBeInTheDocument();
  });
});

describe('LoyaltyStore item context menu (issue #716)', () => {
  beforeEach(() => {
    useLoyaltyStoreOffers.mockReturnValue({
      corpName: 'Federal Navy Academy',
      offersFetchedAt: null,
      offersFromCache: false,
      rows: [ITEM_ROW, BLUEPRINT_ROW, UNRESOLVED_BLUEPRINT_ROW],
      catalog: { byProductTypeID: new Map([[300, { blueprintTypeID: 999 }]]) },
      playerLp: 12_000,
      hub: TRADE_HUBS[0]!,
      ready: true,
      useOwnMaterialsFor: new Set<number>(),
      toggleUseOwnMaterials: () => {},
    });
  });

  it('acts on the offer item for a direct-item offer', async () => {
    const user = userEvent.setup();
    renderStore();
    const row = screen.getByText('Scourge Fury Heavy Missile').closest('tr');
    if (!row) throw new Error('expected an item row');
    fireEvent.contextMenu(row);

    await user.click(screen.getByRole('menuitem', { name: 'View in Market' }));
    expect(probe.pathname).toBe('/market/browser');
    expect(probe.search).toContain('type=200');
  });

  it('acts on the manufactured product, not the blueprint copy, for a blueprint offer', async () => {
    const user = userEvent.setup();
    renderStore();
    const row = screen.getByText('Republic Fleet Firetail Blueprint').closest('tr');
    if (!row) throw new Error('expected a blueprint row');
    fireEvent.contextMenu(row);

    // The resolved product's blueprint status (from the already-loaded
    // catalog) is available immediately — no "checking…" transient.
    expect(screen.getByRole('menuitem', { name: 'Build Plan' })).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'View in Market' }));
    expect(probe.pathname).toBe('/market/browser');
    expect(probe.search).toContain('type=300');
    expect(probe.search).not.toContain('type=999');
  });

  it('renders no context menu for a blueprint offer with an unresolved product', () => {
    renderStore();
    const row = screen.getByText('Mystery Blueprint').closest('tr');
    if (!row) throw new Error('expected the unresolved blueprint row');
    fireEvent.contextMenu(row);

    expect(screen.queryByRole('menuitem', { name: 'View in Market' })).not.toBeInTheDocument();
  });
});

describe('LoyaltyStore blueprint badge (issue #882)', () => {
  it('renders the BP badge at the shared 0.6875rem chip rung', () => {
    useLoyaltyStoreOffers.mockReturnValue({
      corpName: 'Federal Navy Academy',
      offersFetchedAt: null,
      offersFromCache: false,
      rows: [BLUEPRINT_ROW],
      catalog: null,
      playerLp: 12_000,
      hub: TRADE_HUBS[0]!,
      ready: true,
      useOwnMaterialsFor: new Set<number>(),
      toggleUseOwnMaterials: () => {},
    });
    renderStore();

    expect(screen.getByText('BP')).toHaveClass('text-[0.6875rem]');
  });
});

describe('LoyaltyStore required items breakdown (issue #1068)', () => {
  const REQUIRED_ITEMS_ROW: LoyaltyOfferRow = {
    offer: offer({ offer_id: 30, type_id: 500, isk_cost: 0, lp_cost: 18_000 }),
    itemName: 'Vexor Navy Issue Blueprint',
    isBlueprint: false,
    productTypeId: null,
    productName: null,
    build: null,
    profit: { ...PROFIT, profit: 30_095_516 },
    requiredItems: [
      { typeId: 40_000, name: 'Serpentis Palladium Tag', quantity: 8, unitPrice: 100_000 },
      { typeId: 40_001, name: 'Shadow Serpentis Gold Tag', quantity: 1, unitPrice: 5_000_000 },
    ],
    requiredItemsCost: 5_800_000,
  };

  const UNPRICED_REQUIRED_ITEM_ROW: LoyaltyOfferRow = {
    offer: offer({ offer_id: 31, type_id: 501, isk_cost: 0, lp_cost: 18_000 }),
    itemName: 'Some Other Offer',
    isBlueprint: false,
    productTypeId: null,
    productName: null,
    build: null,
    profit: { ...PROFIT, profit: null, iskPerLp: null },
    requiredItems: [{ typeId: 40_002, name: 'Unpriced Faction Tag', quantity: 3, unitPrice: null }],
    requiredItemsCost: null,
  };

  const UNPRICED_MATERIAL_ROW: LoyaltyOfferRow = {
    offer: offer({ offer_id: 32, type_id: 502 }),
    itemName: 'Unpriceable Item',
    isBlueprint: false,
    productTypeId: null,
    productName: null,
    build: null,
    profit: { ...PROFIT, profit: null, iskPerLp: null },
    requiredItems: [],
    requiredItemsCost: 0,
  };

  function mockRows(rows: LoyaltyOfferRow[]) {
    useLoyaltyStoreOffers.mockReturnValue({
      corpName: 'Federal Navy Academy',
      offersFetchedAt: null,
      offersFromCache: false,
      rows,
      catalog: null,
      playerLp: 12_000,
      hub: TRADE_HUBS[0]!,
      ready: true,
      useOwnMaterialsFor: new Set<number>(),
      toggleUseOwnMaterials: () => {},
    });
  }

  it('shows a Required items line, and each item by name and quantity, for an offer with a turn-in', async () => {
    mockRows([REQUIRED_ITEMS_ROW]);
    const user = userEvent.setup();
    renderStore();

    await user.click(screen.getByText('Vexor Navy Issue Blueprint'));

    expect(screen.getByText('Required items')).toBeInTheDocument();
    expect(screen.getByText('8 × Serpentis Palladium Tag')).toBeInTheDocument();
    expect(screen.getByText('1 × Shadow Serpentis Gold Tag')).toBeInTheDocument();
    // The Required items total must equal what profit already subtracted —
    // this reads it straight off `row.requiredItemsCost`, the same number
    // fed into `loyaltyOfferProfit`, so there's nothing here to recompute or
    // let drift.
    expect(screen.getByText('5,800,000')).toBeInTheDocument();
  });

  it('shows no Required items line for an offer with none', async () => {
    mockRows([ITEM_ROW]);
    const user = userEvent.setup();
    renderStore();

    await user.click(screen.getByText('Scourge Fury Heavy Missile'));

    expect(screen.queryByText('Required items')).not.toBeInTheDocument();
  });

  it('shows the same Required items lines in the mobile sheet and the desktop detail — one component', async () => {
    mockRows([REQUIRED_ITEMS_ROW]);

    // Mobile: opens in the sheet.
    const mobileUser = userEvent.setup();
    const mobile = renderStore();
    await mobileUser.click(screen.getByText('Vexor Navy Issue Blueprint'));
    expect(screen.getByText('8 × Serpentis Palladium Tag')).toBeInTheDocument();
    mobile.unmount();

    // Desktop: renders inline, no sheet.
    useDesktopViewport();
    const desktopUser = userEvent.setup();
    renderStore();
    await desktopUser.click(screen.getByText('Vexor Navy Issue Blueprint'));
    expect(screen.getByText('Required items')).toBeInTheDocument();
    expect(screen.getByText('8 × Serpentis Palladium Tag')).toBeInTheDocument();
    expect(screen.getByText('1 × Shadow Serpentis Gold Tag')).toBeInTheDocument();
  });

  it('marks an unpriced required item\'s line "Not priced", and names a required item as the cannot-be-priced cause', async () => {
    mockRows([UNPRICED_REQUIRED_ITEM_ROW]);
    const user = userEvent.setup();
    renderStore();

    await user.click(screen.getByText('Some Other Offer'));

    expect(screen.getByText('3 × Unpriced Faction Tag')).toBeInTheDocument();
    expect(screen.getAllByText('Not priced').length).toBeGreaterThan(0);
    expect(
      screen.getByText("Can't be priced at this hub — a required item has no listed sell price.")
    ).toBeInTheDocument();
  });

  it('still names a material or the product as the cause when that — not a required item — is why the offer is unpriceable', async () => {
    mockRows([UNPRICED_MATERIAL_ROW]);
    const user = userEvent.setup();
    renderStore();

    await user.click(screen.getByText('Unpriceable Item'));

    expect(
      screen.getByText(
        "Can't be priced at this hub — a material or the product has no listed sell price."
      )
    ).toBeInTheDocument();
  });
});
