import { beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import '@/i18n';
import { db } from '@/db';
import { useCompareSet } from '@/features/market/compareSet';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { DEFAULT_ASSET_SORT, useAssetSort } from '@/features/assets/assetSortPreference';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';
import { useCharacterFilterPicks } from '@/features/character/characterFilterPicks';
import * as routeChunks from '@/app/routeChunks';
import { Assets } from '@/routes/Assets';
import { mswServer } from '@/test/msw';
import { renderPageRoute } from '@/test/renderPage';

export const CHAR_ID = 91;
export const JITA = 'Jita IV - Moon 4 - Caldari Navy Assembly Plant';
export const STRUCTURE = 'Structure #1000000000001';

export const assetPage1 = [
  {
    item_id: 1,
    type_id: 34,
    quantity: 500,
    location_id: 60003760,
    location_type: 'station' as const,
    location_flag: 'Hangar',
    is_singleton: false,
  },
];
export const assetPage2 = [
  {
    item_id: 2,
    type_id: 35,
    quantity: 10,
    location_id: 1000000000001,
    location_type: 'other' as const,
    location_flag: 'Hangar',
    is_singleton: false,
  },
];

export const server = mswServer(
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/assets`, ({ request }) => {
    const page = new URL(request.url).searchParams.get('page');
    return HttpResponse.json(page === '2' ? assetPage2 : assetPage1, {
      headers: { 'X-Pages': '2' },
    });
  }),
  http.get('https://esi.evetech.net/universe/stations/60003760', () =>
    HttpResponse.json({
      station_id: 60003760,
      name: JITA,
      type_id: 1531,
      system_id: 30000142,
    })
  ),
  http.get('https://esi.evetech.net/universe/systems/30000142', () =>
    HttpResponse.json({ system_id: 30000142, name: 'Jita', security_status: 0.9459 })
  ),
  http.get('https://esi.evetech.net/universe/structures/1000000000001', () =>
    HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
  ),
  http.get('https://esi.evetech.net/markets/prices', () => HttpResponse.json([])),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/location`, () =>
    HttpResponse.json({ solar_system_id: 30000142 })
  ),
  http.post('https://esi.evetech.net/route/:origin/:destination', ({ params }) =>
    HttpResponse.json({ route: [Number(params.origin), Number(params.destination)] })
  )
);

async function resetSession() {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  await db.stationPins.clear();
  await db.buildPlans.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  useCompareSet.setState({ items: [] });
  useAssetSort.setState({ value: DEFAULT_ASSET_SORT, hydrated: false });
  useDefaultCharacterFilter.setState({ value: 'current', hydrated: false });
  useCharacterFilterPicks.setState({ value: {}, hydrated: false });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-assets.read_assets.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/assets');
}

export function renderAssetsRoute() {
  return renderPageRoute('/assets', <Assets />);
}

export function installAssetsHarness({ warmApp = false }: { warmApp?: boolean } = {}): void {
  beforeAll(async () => {
    await routeChunks.loadAssets();
    await resetSession();
    const App = warmApp ? (await import('@/app/App')).App : null;
    const { unmount } = App ? render(<App />) : renderAssetsRoute();
    await screen.findByText(JITA, undefined, { timeout: 25_000 });
    unmount();
    server.resetHandlers();
  }, 30_000);

  beforeEach(resetSession);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function clickTool(
  user: ReturnType<typeof userEvent.setup>,
  name: string
): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Tools' }));
  await user.click(await screen.findByRole('menuitemcheckbox', { name }));
}

export async function downloadCsv(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Tools' }), {
    button: 0,
    pointerType: 'mouse',
  });
  (await screen.findByRole('menuitem', { name: 'Export table' })).focus();
  await user.keyboard('{ArrowRight}');
  (await screen.findByRole('menuitem', { name: 'Download CSV' })).focus();
  await user.keyboard('{Enter}');
}

export async function openLocation(
  user: ReturnType<typeof userEvent.setup>,
  name: string | RegExp
): Promise<void> {
  const matcher = typeof name === 'string' ? new RegExp(escapeRegExp(name)) : name;
  await user.click(await screen.findByRole('link', { name: matcher }, { timeout: 15_000 }));
}

export async function goBack(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: /back one level/i }));
}

export function locationOrder(): string[] {
  return screen
    .getAllByText(new RegExp(`^(${JITA}|${STRUCTURE})$`))
    .map((el) => el.textContent ?? '');
}
