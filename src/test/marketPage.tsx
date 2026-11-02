import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useMarketHub } from '@/features/market/hub';
import { useMarketBrowserHub } from '@/features/market/browserHub';
import { useLocationMode, DEFAULT_LOCATION_MODE } from '@/features/market/locationMode';
import {
  useBrowserFilterSetting,
  DEFAULT_BROWSER_FILTER_SETTING,
} from '@/features/market/browserFilterSetting';
import { clearOrderBookCache } from '@/features/market/orderBook';
import { resetEsiBudget } from '@/esi/budget';
import { useCompareSet } from '@/features/market/compareSet';
import { ESI_BASE_URL } from '@/esi/client';
import * as routeChunks from '@/app/routeChunks';
import {
  CORAX_TYPE_ID,
  CORMORANT_TYPE_ID,
  GPMR_REGION_ID,
  KESTREL_TYPE_ID,
  MERLIN_TYPE_ID,
  PLEX_TYPE_ID,
} from '@/test/marketMocks';

// Shared harness for the Market route tests (src/routes/Market*.test.tsx), one
// file per concern so CI runs them in parallel. The `vi.mock` calls stay in each
// test file (vitest hoists them per file); their factories live in marketMocks.tsx.

export const RIFTER_REGION_ID = 10000002; // The Forge (Jita hub's region)

export function ordersHandler(hits: { count: number }) {
  return http.get(`${ESI_BASE_URL}/markets/${RIFTER_REGION_ID}/orders`, () => {
    hits.count += 1;
    return HttpResponse.json(
      [
        {
          order_id: 1,
          type_id: 587,
          is_buy_order: false,
          price: 1000000,
          location_id: 60003760, // Jita 4-4, the hub's own station
          system_id: 30000142,
          volume_remain: 5,
          volume_total: 10,
          min_volume: 1,
          duration: 90,
          issued: '2026-08-01T00:00:00Z',
          range: 'region',
        },
        {
          order_id: 2,
          type_id: 587,
          is_buy_order: true,
          price: 500000,
          location_id: 60003760, // Jita 4-4, the hub's own station
          system_id: 30000142,
          volume_remain: 3,
          volume_total: 3,
          min_volume: 1,
          duration: 90,
          issued: '2026-08-01T00:00:00Z',
          range: '5',
        },
        {
          order_id: 3,
          type_id: 587,
          is_buy_order: false,
          price: 2000000,
          location_id: 1035466617946, // player structure elsewhere in the region, not in STATIONS
          system_id: 30000142,
          volume_remain: 1,
          volume_total: 1,
          min_volume: 1,
          duration: 90,
          issued: '2026-08-01T00:00:00Z',
          range: 'region',
        },
      ],
      { headers: { 'X-Pages': '1' } }
    );
  });
}

// Related Items strip (issue #10): a type_id-aware handler so each Destroyer
// sibling's own order book differs, unlike ordersHandler above which answers
// identically for any type_id in its region. hits counts requests per type_id
// so a test can tell "the strip refetched" apart from "the main item refetched".
export function destroyerOrdersHandler(hits: Map<number, number>) {
  const ordersByType: Record<number, unknown[]> = {
    [MERLIN_TYPE_ID]: [
      {
        order_id: 100,
        type_id: MERLIN_TYPE_ID,
        is_buy_order: false,
        price: 900000,
        location_id: 60003760,
        system_id: 30000142,
        volume_remain: 2,
        volume_total: 2,
        min_volume: 1,
        duration: 90,
        issued: '2026-08-01T00:00:00Z',
        range: 'region',
      },
      {
        // A second location, hidden by Trade Hub mode, so the station-filter
        // test below can filter down to a location the siblings have no
        // orders at.
        order_id: 103,
        type_id: MERLIN_TYPE_ID,
        is_buy_order: false,
        price: 850000,
        location_id: 1035466617946,
        system_id: 30000142,
        volume_remain: 1,
        volume_total: 1,
        min_volume: 1,
        duration: 90,
        issued: '2026-08-01T00:00:00Z',
        range: 'region',
      },
    ],
    [KESTREL_TYPE_ID]: [
      {
        order_id: 101,
        type_id: KESTREL_TYPE_ID,
        is_buy_order: false,
        price: 1500000,
        location_id: 60003760,
        system_id: 30000142,
        volume_remain: 1,
        volume_total: 1,
        min_volume: 1,
        duration: 90,
        issued: '2026-08-01T00:00:00Z',
        range: 'region',
      },
    ],
    [CORMORANT_TYPE_ID]: [],
    [CORAX_TYPE_ID]: [
      {
        order_id: 102,
        type_id: CORAX_TYPE_ID,
        is_buy_order: true,
        price: 700000,
        location_id: 60003760,
        system_id: 30000142,
        volume_remain: 1,
        volume_total: 1,
        min_volume: 1,
        duration: 90,
        issued: '2026-08-01T00:00:00Z',
        range: 'region',
      },
    ],
  };
  return http.get(`${ESI_BASE_URL}/markets/${RIFTER_REGION_ID}/orders`, ({ request }) => {
    const typeId = Number(new URL(request.url).searchParams.get('type_id'));
    hits.set(typeId, (hits.get(typeId) ?? 0) + 1);
    return HttpResponse.json(ordersByType[typeId] ?? [], { headers: { 'X-Pages': '1' } });
  });
}

export function plexOrdersHandler(hits: { count: number }) {
  return http.get(`${ESI_BASE_URL}/markets/${GPMR_REGION_ID}/orders`, () => {
    hits.count += 1;
    return HttpResponse.json(
      [
        {
          order_id: 10,
          type_id: PLEX_TYPE_ID,
          is_buy_order: false,
          price: 3000000,
          location_id: 60003760, // PLEX orders still carry ordinary station ids
          system_id: 30000142,
          volume_remain: 267,
          volume_total: 267,
          min_volume: 1,
          duration: 90,
          issued: '2026-08-01T00:00:00Z',
          range: 'region',
        },
      ],
      { headers: { 'X-Pages': '1' } }
    );
  });
}

export function historyHandler(
  hits: { count: number },
  regionId: number,
  byType: Record<number, unknown[]>
) {
  return http.get(`${ESI_BASE_URL}/markets/${regionId}/history`, ({ request }) => {
    hits.count += 1;
    const typeId = Number(new URL(request.url).searchParams.get('type_id'));
    return HttpResponse.json(byType[typeId] ?? []);
  });
}

// A default network error for the item-detail fetch the header fires on selection: tests that
// read it override it; the rest don't care, and with no delay between keystrokes
// it lands before teardown, where it would otherwise be an unhandled request.
export const server = setupServer(
  http.get(`${ESI_BASE_URL}/universe/types/:typeId`, () => HttpResponse.error())
);

/** Registers the file's MSW lifecycle and the per-test reset. Call once at module scope. */
export function installMarketHarness(): void {
  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'error' });
    // The page is code-split: the first render waits on a cold import of the
    // Layout and Market chunks. Under CI load that alone outran the first
    // test's findBy budget, leaving an empty <main> ("Unable to find
    // role=button Ships"), so import them before any test renders.
    await Promise.all([routeChunks.loadLayout(), routeChunks.loadMarket()]);
  });
  afterAll(() => server.close());
  afterEach(() => {
    vi.useRealTimers();
    server.resetHandlers();
  });
  beforeEach(async () => {
    await db.characters.clear();
    await db.settings.clear();
    await db.quickbars.clear();
    // Price history reads through esiCache; a row left by one test would answer
    // the next test's request for the same item without reaching its handler.
    await db.esiCache.clear();
    // Market needs no ESI scope and no *active* Character, but the feature area
    // sits behind RequireCharacter, so one must exist for the route to render.
    await db.characters.put({ characterId: 1, name: 'Pilot One', ownerHash: 'oh', addedAt: 0 });
    useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
    usePublicInfo.setState({ byCharacterId: {} });
    useMarketHub.setState({ value: 'jita', hydrated: false });
    useMarketBrowserHub.setState({ value: 'jita', hydrated: false });
    useLocationMode.setState({ value: DEFAULT_LOCATION_MODE, hydrated: false });
    useBrowserFilterSetting.setState({ value: DEFAULT_BROWSER_FILTER_SETTING, hydrated: false });
    useCompareSet.setState({ items: [] });
    clearOrderBookCache();
    // Module state, and it latches. One test provoking an ESI error (the 420 in
    // "an ESI failure clears the spinner" in Market.variations.test.tsx) trips the error-limit gate, and
    // without this every later test in the file has its fetches declined before
    // they are sent — eleven of them failed that way on a "Sell Orders" table
    // that never arrived, with nothing in the message to say why.
    resetEsiBudget();
    window.history.pushState({}, '', '/market');
  });
}

// The Market Group, not the nav rail's "Ships" link: the group is a button.
// Matches the plain browse header and the search one, which appends " · <count>".
export const SHIPS_GROUP = { name: /^Ships(?: ·|$)/ } as const;

/** Variations live behind their own item tab, next to Order Book and Price History. */
export async function openVariationsTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('tab', { name: /^Variations/ }));
  return screen.findByRole('table', { name: 'Variations' });
}

/** The finder column: item search, its filter funnel, the Market Group tree. */
export function finder(): HTMLElement {
  const panel = screen.getByRole('searchbox').closest('section');
  if (!panel) throw new Error('expected the finder panel');
  return panel;
}

export async function pinRifterFromHeaderBell(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByRole('searchbox'), 'rift');
  await user.click(await screen.findByText('Rifter'));
  await user.click(await screen.findByRole('button', { name: 'Set price alert' }));
  await user.type(await screen.findByLabelText('Target price (ISK)'), '1000000');
  await user.click(screen.getByRole('button', { name: 'Save' }));
}
