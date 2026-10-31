import { beforeAll, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { clearJumpGraphIndex } from '@/sde/jumpGraph';
import { clearSolarSystemIndex } from '@/sde/solarSystems';
import { clearRouteKillCaches } from '@/features/travel/routeKillsData';
import { App } from '@/app/App';
import * as routeChunks from '@/app/routeChunks';
import { clearEveScoutCache, EVE_SCOUT_SIGNATURES_URL } from '@/lib/eveScout';
import { mswServer } from '@/test/msw';
import {
  JITA,
  JUMPS,
  PERIMETER,
  PERIMETER_REGION,
  THERA,
  UEDAMA,
  UEDAMA_REGION,
  loadSolarSystemJumps,
  travelState,
} from '@/test/travelMocks';

// Shared harness for the Travel route tests (src/routes/Travel*.test.tsx), one
// file per concern so CI runs them in parallel. The `vi.mock` calls stay in each
// test file (vitest hoists them per file); their factories live in travelMocks.tsx.

export const CHAR_ID = 91;
export const ESI = 'https://esi.evetech.net';

export const HOUR = 3_600_000;
export const TURNUR = 30002086;

export function signature(overrides: Record<string, unknown>) {
  return {
    id: '1',
    signature_type: 'wormhole',
    out_system_id: THERA,
    out_system_name: 'Thera',
    out_signature: 'AAA-111',
    in_signature: 'BBB-222',
    in_system_class: 'hs',
    in_region_name: 'The Forge',
    wh_type: 'Q063',
    max_ship_size: 'medium',
    expires_at: new Date(Date.now() + 10 * HOUR).toISOString(),
    ...overrides,
  };
}

export const SIGNATURES = [
  signature({
    id: 'uedama',
    in_system_id: UEDAMA,
    in_system_name: 'Uedama',
    in_signature: 'UED-001',
  }),
  signature({
    id: 'perimeter',
    out_system_id: TURNUR,
    out_system_name: 'Turnur',
    in_system_id: PERIMETER,
    in_system_name: 'Perimeter',
    in_signature: 'PER-002',
    max_ship_size: 'capital',
    expires_at: new Date(Date.now() + HOUR).toISOString(),
  }),
  signature({
    id: 'jspace',
    in_system_id: 31000629,
    in_system_name: 'J120704',
    in_system_class: 'c2',
    in_region_name: 'C-R00010',
  }),
  signature({
    id: 'expired',
    in_system_id: JITA,
    in_system_name: 'Jita',
    expires_at: new Date(Date.now() - HOUR).toISOString(),
  }),
];

export const UEDAMA_GATE_TO_PERIMETER = 50001001;
export const KILL_TIME = new Date(Date.now() - 12 * 60_000).toISOString();

export const server = mswServer(
  http.get(EVE_SCOUT_SIGNATURES_URL, () => HttpResponse.json(SIGNATURES)),
  http.get('https://zkillboard.com/api/kills/regionID/:id/pastSeconds/3600/', ({ params }) => {
    if (Number(params.id) === PERIMETER_REGION) return new HttpResponse(null, { status: 429 });
    if (Number(params.id) !== UEDAMA_REGION) return HttpResponse.json([]);
    const kill = (id: number, npc: boolean) => ({
      killmail_id: id,
      killmail_time: KILL_TIME,
      solar_system_id: UEDAMA,
      attackers: [{ ship_type_id: 4310, weapon_type_id: 3995 }],
      victim: { ship_type_id: 670 },
      zkb: { locationID: UEDAMA_GATE_TO_PERIMETER, npc },
    });
    return HttpResponse.json([kill(1, false), kill(2, false), kill(3, true)]);
  }),
  http.get(`${ESI}/universe/stargates/${UEDAMA_GATE_TO_PERIMETER}`, () =>
    HttpResponse.json({
      stargate_id: UEDAMA_GATE_TO_PERIMETER,
      name: 'Stargate (Perimeter)',
      system_id: UEDAMA,
      destination: { stargate_id: 50001000, system_id: PERIMETER },
    })
  ),
  http.get(`${ESI}/incursions`, () =>
    travelState.incursions === null
      ? new HttpResponse(null, { status: 503 })
      : HttpResponse.json(travelState.incursions)
  ),
  http.get(`${ESI}/universe/system_kills`, () =>
    HttpResponse.json([{ system_id: UEDAMA, ship_kills: 12, pod_kills: 4, npc_kills: 2 }])
  ),
  http.get(`${ESI}/universe/system_jumps`, () =>
    HttpResponse.json([
      { system_id: JITA, ship_jumps: 4200 },
      { system_id: UEDAMA, ship_jumps: 900 },
    ])
  ),
  http.post(`${ESI}/universe/names`, () =>
    HttpResponse.json([{ id: 10000033, name: 'The Citadel', category: 'region' }])
  ),
  http.get(`${ESI}/characters/${CHAR_ID}/location`, () =>
    HttpResponse.json({ solar_system_id: JITA })
  )
);

export function installTravelHarness(): void {
  beforeAll(async () => {
    // One throwaway render of a Route Safety route, so no test pays for the
    // first one. A worker's first `App` render — compiling the lazy route
    // chunks, warming jsdom and React — cost 4-6s on top of a warm render, and
    // it landed on whichever test ran first. Done here under the hook's own
    // budget; `beforeEach` clears every cache it filled.
    await routeChunks.loadTravel();
    await resetState();
    window.history.pushState({}, '', `/travel/route?from=${JITA}&to=${UEDAMA}`);
    const { unmount } = render(<App />);
    await screen.findByRole('table', { name: 'Systems on the route' }, { timeout: 25_000 });
    unmount();
  }, 30_000);

  beforeEach(() => {
    travelState.lawlessSystems = new Set();
    travelState.incursions = [];
    return resetState();
  });
}

export async function resetState() {
  clearJumpGraphIndex();
  clearSolarSystemIndex();
  clearEveScoutCache();
  clearRouteKillCaches();
  loadSolarSystemJumps.mockReset();
  loadSolarSystemJumps.mockResolvedValue(JUMPS);
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-location.read_location.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
}

/** The system picker's text box; the Route rules ship picker is a combobox too. */
export async function systemPickerInput(): Promise<HTMLElement> {
  const boxes = await screen.findAllByRole('combobox');
  return boxes.find((box) => box.tagName === 'INPUT') ?? boxes[0];
}

/** One labelled figure from the route summary strip, e.g. `routeFact('Jumps')` → "4". */
export function routeFact(label: string) {
  const summary = within(screen.getByRole('group', { name: 'Route summary' }));
  return summary.getByText(label, { selector: 'span' }).parentElement?.lastElementChild
    ?.textContent;
}

export function visit(search: string) {
  window.history.pushState({}, '', `/travel/route${search}`);
  render(<App />);
}
