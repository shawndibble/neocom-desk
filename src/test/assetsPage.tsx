import { afterEach, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import '@/i18n';
import { db } from '@/db';
import { clearMarketPriceCache } from '@/market/prices';
import { useCompareSet } from '@/features/market/compareSet';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { DEFAULT_ASSET_SORT, useAssetSort } from '@/features/assets/assetSortPreference';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';
import { useCharacterFilterPicks } from '@/features/character/characterFilterPicks';
import { App } from '@/app/App';
import * as routeChunks from '@/app/routeChunks';
import { mswServer } from '@/test/msw';

// Shared harness for the Assets route tests (src/routes/Assets*.test.tsx), one
// file per concern so CI runs them in parallel. The `vi.mock` calls stay in each
// test file (vitest hoists them per file); their factories live in assetsMocks.tsx.

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
  // Security status (issue #148): every test's default station resolves to
  // this system, so its security fetch needs a default handler too, the same
  // way the station name lookup just above does.
  http.get('https://esi.evetech.net/universe/systems/30000142', () =>
    HttpResponse.json({ system_id: 30000142, name: 'Jita', security_status: 0.9459 })
  ),
  // This character's token predates esi-universe.read_structures.v1 (see the
  // token fixture below), so ESI 403s — the structure falls back to its bare
  // id label rather than triggering a re-auth banner.
  http.get('https://esi.evetech.net/universe/structures/1000000000001', () =>
    HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
  ),
  http.get('https://esi.evetech.net/markets/prices', () => HttpResponse.json([])),
  // Jumps-away (issue #87): the active character starts in Jita's system
  // (30000142, same as the fixture station above), and any route call that
  // does end up needed (e.g. cross-character search reaching a different
  // system) gets a harmless generic route so no test has to know about it.
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
  // Module-scope store, so a sort chosen by one test would otherwise be the
  // starting order of the next one.
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

/**
 * Registers the cold-render warm-up, the per-test session reset and the market
 * price cache clear (the MSW server's own lifecycle comes from `mswServer`). Call once at module scope of each Assets test file.
 */
export function installAssetsHarness(): void {
  afterEach(clearMarketPriceCache);
  beforeAll(async () => {
    // One throwaway render, so no test pays for the first one. A worker's first
    // `App` render — compiling the lazy route chunks, warming jsdom and React —
    // lands on whichever test runs first and can outlast its 1s `findByText`
    // under parallel load. Done here under the hook's own budget.
    await routeChunks.loadAssets();
    await resetSession();
    const { unmount } = render(<App />);
    await screen.findByText(JITA, undefined, { timeout: 25_000 });
    unmount();
    server.resetHandlers();
    clearMarketPriceCache();
  }, 30_000);

  beforeEach(resetSession);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Opens the Tools (⋯) menu and picks one of its toggles. */
export async function clickTool(
  user: ReturnType<typeof userEvent.setup>,
  name: string
): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Tools' }));
  await user.click(await screen.findByRole('menuitemcheckbox', { name }));
}

/** Tools ▸ Export table ▸ Download CSV. */
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

/** Clicks the link into a location or container by its (partial) label. */
export async function openLocation(
  user: ReturnType<typeof userEvent.setup>,
  name: string | RegExp
): Promise<void> {
  const matcher = typeof name === 'string' ? new RegExp(escapeRegExp(name)) : name;
  // Every test opens a location first, and a loaded CI worker can take longer
  // than the 5s default to paint the first row (a flake once hit the "no bulk
  // Add to Compare" test). A wait that returns the moment the link renders, not
  // a longer test budget.
  await user.click(await screen.findByRole('link', { name: matcher }, { timeout: 15_000 }));
}

/** The single back control in the breadcrumb header — steps up exactly one level. */
export async function goBack(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: /back one level/i }));
}

/** Every top-level location label currently on screen, in DOM order. */
export function locationOrder(): string[] {
  return screen
    .getAllByText(new RegExp(`^(${JITA}|${STRUCTURE})$`))
    .map((el) => el.textContent ?? '');
}
