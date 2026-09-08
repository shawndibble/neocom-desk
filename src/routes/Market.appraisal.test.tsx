import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { useMarketHub } from '@/features/market/hub';
import { useMarketPricePercent } from '@/features/market/pricePercent';
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
  })),
  loadAppraisalCatalogue: vi.fn(async () => new Map()),
  clearAppraisalCatalogue: vi.fn(),
}));

// Recording the URL is exactly what an effect is for — writing the latest
// React state out to something outside React. Doing it during render trips
// `react-hooks/globals` / `react-hooks/immutability`, and rightly so.
const probe = { search: '' };
function LocationProbe() {
  const { search } = useLocation();
  useEffect(() => {
    probe.search = search;
  }, [search]);
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
  probe.search = '';
  // The hub is a *synced* setting, so picking one writes it to Dexie as well
  // as to the store. Resetting only the store leaves the row behind, and the
  // next test's `hydrateHub()` reads it back asynchronously — landing on the
  // hub the previous test picked, which makes picking that hub again a no-op
  // firing no `onValueChange` at all.
  await db.settings.clear();
  useMarketHub.setState({ value: 'jita', hydrated: false });
  useMarketPricePercent.setState({ value: 100, hydrated: false });
});

describe('Market Appraisal tab navigation', () => {
  it('offers the trade hub picker but not the Location Mode chips', async () => {
    renderAt('/market?section=appraisal');

    expect(await screen.findByRole('combobox', { name: /Trade Hub/i })).toBeInTheDocument();
    // Region has no meaning here: prices come from one station's aggregates.
    expect(screen.queryByRole('button', { name: /Region/i })).not.toBeInTheDocument();
  });

  /**
   * `navigateTo` replaces the whole query with `buildMarketParams`' canonical
   * set. Without carrying `section` across, a URL grabbed after changing hub
   * named the wrong tab.
   */
  it('keeps section=appraisal in the URL when the hub changes', async () => {
    renderAt('/market?section=appraisal');
    await screen.findByRole('combobox', { name: /Trade Hub/i });

    await pickHub('Amarr');

    await waitFor(() => expect(probe.search).toContain('hub=amarr'));
    expect(new URLSearchParams(probe.search).get('section')).toBe('appraisal');
  });

  /**
   * The sharp edge: with a `type` left in the query from the Browser tab,
   * dropping `section` makes the URL look like an external item cross-link
   * (`crossLinkedToBrowser`), which answers by yanking the pilot back to the
   * Browser mid-appraisal.
   */
  it('stays on the tab when the hub changes with an item still in the URL', async () => {
    renderAt('/market?type=34&section=appraisal');
    await screen.findByRole('combobox', { name: /Trade Hub/i });
    expect(screen.getByText('Nothing appraised yet')).toBeInTheDocument();

    await pickHub('Amarr');

    await waitFor(() => expect(probe.search).toContain('hub=amarr'));
    expect(new URLSearchParams(probe.search).get('section')).toBe('appraisal');
    expect(screen.getByText('Nothing appraised yet')).toBeInTheDocument();
  });
});
