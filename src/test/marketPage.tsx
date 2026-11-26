import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { resetHubStores } from '@/test/hubStores';
import { resetKnownLinkedHub } from '@/features/market/useMarketBrowser';
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
import { Market } from '@/routes/Market';
import { renderPageRoute } from '@/test/renderPage';
import {
  CORAX_TYPE_ID,
  CORMORANT_TYPE_ID,
  GPMR_REGION_ID,
  KESTREL_TYPE_ID,
  MERLIN_TYPE_ID,
  PLEX_TYPE_ID,
  TYPES,
} from '@/test/marketMocks';

export function renderMarketRoute() {
  return renderPageRoute('/market', <Market />);
}

export const RIFTER_REGION_ID = 10000002;

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
          location_id: 60003760,
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
          location_id: 60003760,
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
      { headers: { 'X-Pages': '1' } }
    );
  });
}

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
          location_id: 60003760,
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

export function marketTypesHandler(typeIds: readonly number[]) {
  return http.get(`${ESI_BASE_URL}/markets/:regionId/types`, () =>
    HttpResponse.json(typeIds, { headers: { 'X-Pages': '1' } })
  );
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

export const server = setupServer(
  http.get(`${ESI_BASE_URL}/universe/types/:typeId`, () => HttpResponse.error()),
  marketTypesHandler(TYPES.map((type) => type.typeId))
);

async function resetMarketSession(): Promise<void> {
  await db.characters.clear();
  await db.settings.clear();
  await db.quickbars.clear();
  await db.esiCache.clear();
  await db.characters.put({ characterId: 1, name: 'Pilot One', ownerHash: 'oh', addedAt: 0 });
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  resetHubStores();
  resetKnownLinkedHub();
  useLocationMode.setState({ value: DEFAULT_LOCATION_MODE, hydrated: false });
  useBrowserFilterSetting.setState({ value: DEFAULT_BROWSER_FILTER_SETTING, hydrated: false });
  useCompareSet.setState({ items: [] });
  clearOrderBookCache();
  resetEsiBudget();
  window.history.pushState({}, '', '/market');
}

export function installMarketHarness(): void {
  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'error' });
    await routeChunks.loadMarket();
    await resetMarketSession();
    const { unmount } = renderMarketRoute();
    await screen.findByRole('button', SHIPS_GROUP, { timeout: 25_000 });
    unmount();
    server.resetHandlers();
  }, 30_000);
  afterAll(() => server.close());
  afterEach(() => {
    vi.useRealTimers();
    server.resetHandlers();
  });
  beforeEach(resetMarketSession);
}

export const SHIPS_GROUP = { name: /^Ships(?: ·|$)/ } as const;

export async function openVariationsTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('tab', { name: /^Variations/ }));
  return screen.findByRole('table', { name: 'Variations' });
}

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
