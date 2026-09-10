import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import '@/i18n';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
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

const PROFIT = { revenue: 1000, profit: 500, iskPerLp: 5, affordableLp: true };

const ITEM_ROW: LoyaltyOfferRow = {
  offer: offer({ offer_id: 1, type_id: 200 }),
  itemName: 'Scourge Fury Heavy Missile',
  isBlueprint: false,
  productTypeId: null,
  productName: null,
  build: null,
  profit: PROFIT,
};

const BLUEPRINT_ROW: LoyaltyOfferRow = {
  offer: offer({ offer_id: 2, type_id: 999 }),
  itemName: 'Republic Fleet Firetail Blueprint',
  isBlueprint: true,
  productTypeId: 300,
  productName: 'Republic Fleet Firetail',
  build: null,
  profit: PROFIT,
};

const UNRESOLVED_BLUEPRINT_ROW: LoyaltyOfferRow = {
  offer: offer({ offer_id: 3, type_id: 998 }),
  itemName: 'Mystery Blueprint',
  isBlueprint: true,
  productTypeId: null,
  productName: null,
  build: null,
  profit: PROFIT,
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
    expect(probe.pathname).toBe('/market');
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
    expect(probe.pathname).toBe('/market');
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
