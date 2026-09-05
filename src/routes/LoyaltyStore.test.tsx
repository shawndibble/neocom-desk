import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
import { TRADE_HUBS } from '@/market/hubs';

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

function renderStore() {
  return render(
    <MemoryRouter initialEntries={['/loyalty/1000168']}>
      <Routes>
        <Route path="/loyalty/:corporationId" element={<LoyaltyStore />} />
      </Routes>
    </MemoryRouter>
  );
}

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
