/**
 * The device-local Ansiblex list (issue #2478): what a character's structure
 * search finds, and what the pilot pastes, merged into one list.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL, configureEsi } from '@/esi/client';
import { db } from '@/db';
import { ANSIBLEX_TYPE_ID, type SystemLookup } from '@/engine/route/ansiblex';
import {
  findGatesWithCharacter,
  gatesOf,
  removeAnsiblexGate,
  savePastedGates,
} from './ansiblexGates';

const server = setupServer();
const PILOT = 91;
const ALT = 92;

const A = 30000001;
const B = 30000002;
const C = 30000003;
const SYSTEMS: Record<string, number> = { 'a-1': A, 'b-2': B, 'c-3': C };
const lookup: SystemLookup = (name) => {
  const id = SYSTEMS[name.toLowerCase()];
  return id === undefined ? undefined : { id, security: -0.4 };
};

const AB_ID = 1_000_000_000_001;
const BC_ID = 1_000_000_000_002;
const KEEPSTAR_ID = 1_000_000_000_003;
const HIDDEN_ID = 1_000_000_000_004;
const UNKNOWN_ID = 1_000_000_000_005;

const STRUCTURES: Record<number, object> = {
  [AB_ID]: { name: 'A-1 » B-2 - Road', owner_id: 1, solar_system_id: A, type_id: ANSIBLEX_TYPE_ID },
  [BC_ID]: { name: 'B-2 » C-3 - Lane', owner_id: 1, solar_system_id: B, type_id: ANSIBLEX_TYPE_ID },
  [KEEPSTAR_ID]: { name: 'A-1 » Home', owner_id: 1, solar_system_id: A, type_id: 35834 },
  [UNKNOWN_ID]: {
    name: 'A-1 » Nowhere - Gate',
    owner_id: 1,
    solar_system_id: A,
    type_id: ANSIBLEX_TYPE_ID,
  },
};

let searched: URL[] = [];

function searchFinds(characterId: number, ids: number[]) {
  return http.get(`${ESI_BASE_URL}/characters/${characterId}/search`, ({ request }) => {
    searched.push(new URL(request.url));
    return HttpResponse.json({ structure: ids });
  });
}

const structures = http.get(`${ESI_BASE_URL}/universe/structures/:id`, ({ params }) => {
  const body = STRUCTURES[Number(params.id)];
  return body
    ? HttpResponse.json(body)
    : HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
});

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  configureEsi({ getToken: async () => 'token' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  configureEsi({ getToken: null });
});
const SEARCH_SCOPES = ['esi-search.search_structures.v1', 'esi-universe.read_structures.v1'];

async function grant(characterId: number, scopes: string[]) {
  await db.tokens.put({
    characterId,
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 3_600_000,
    scopes,
  });
}

beforeEach(async () => {
  searched = [];
  await db.esiCache.clear();
  await db.ansiblexGates.clear();
  await db.tokens.clear();
  await grant(PILOT, SEARCH_SCOPES);
  await grant(ALT, SEARCH_SCOPES);
});

describe('findGatesWithCharacter', () => {
  it('searches structures for " » " and keeps each Ansiblex it can read, saying who found it', async () => {
    server.use(searchFinds(PILOT, [AB_ID, KEEPSTAR_ID, HIDDEN_ID]), structures);

    const outcome = await findGatesWithCharacter(PILOT, lookup);

    expect(outcome).toEqual({ kind: 'found', count: 1, unknown: [] });
    expect(searched[0]?.searchParams.get('search')).toBe(' » ');
    expect(searched[0]?.searchParams.get('categories')).toBe('structure');
    expect(await gatesOf()).toEqual([
      expect.objectContaining({
        id: `search:${AB_ID}`,
        fromId: A,
        toId: B,
        name: 'A-1 » B-2 - Road',
        source: 'search',
        foundBy: [PILOT],
      }),
    ]);
  });

  it('names the systems of a gate it could not place', async () => {
    server.use(searchFinds(PILOT, [UNKNOWN_ID]), structures);
    expect(await findGatesWithCharacter(PILOT, lookup)).toEqual({
      kind: 'found',
      count: 0,
      unknown: ['Nowhere'],
    });
  });

  it('merges what each character finds, and a new search replaces only that character’s finds', async () => {
    server.use(searchFinds(PILOT, [AB_ID, BC_ID]), searchFinds(ALT, [AB_ID]), structures);
    await findGatesWithCharacter(PILOT, lookup);
    await findGatesWithCharacter(ALT, lookup);
    expect((await gatesOf()).map(({ id, foundBy }) => [id, foundBy])).toEqual([
      [`search:${AB_ID}`, [PILOT, ALT]],
      [`search:${BC_ID}`, [PILOT]],
    ]);

    server.use(searchFinds(PILOT, [AB_ID]));
    await findGatesWithCharacter(PILOT, lookup);
    expect((await gatesOf()).map(({ id, foundBy }) => [id, foundBy])).toEqual([
      [`search:${AB_ID}`, [PILOT, ALT]],
    ]);
  });

  it('asks nothing of ESI for a character without the search permission', async () => {
    await grant(ALT, ['esi-universe.read_structures.v1']);
    server.use(searchFinds(ALT, [AB_ID]), structures);
    expect(await findGatesWithCharacter(ALT, lookup)).toEqual({ kind: 'no-scope' });
    expect(searched).toEqual([]);
  });

  it('reports a failed search and leaves the list as it was', async () => {
    server.use(searchFinds(PILOT, [AB_ID]), structures);
    await findGatesWithCharacter(PILOT, lookup);
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${PILOT}/search`, () =>
        HttpResponse.json({ error: 'bad search' }, { status: 400 })
      )
    );
    expect(await findGatesWithCharacter(PILOT, lookup)).toEqual({ kind: 'failed' });
    expect(await gatesOf()).toHaveLength(1);
  });
});

describe('pasted gates', () => {
  it('saves pasted gates, one per pair, beside the ones a search found', async () => {
    await savePastedGates([
      { fromId: A, toId: B, name: 'A-1 » B-2' },
      { fromId: B, toId: C, name: 'B-2 » C-3' },
    ]);
    await savePastedGates([{ fromId: B, toId: A, name: 'B-2 » A-1' }]);
    expect((await gatesOf()).map(({ id, source }) => [id, source])).toEqual([
      [`paste:${A}:${B}`, 'paste'],
      [`paste:${B}:${C}`, 'paste'],
    ]);
  });

  it('removes one gate from the list', async () => {
    await savePastedGates([{ fromId: A, toId: B, name: 'A-1 » B-2' }]);
    await removeAnsiblexGate(`paste:${A}:${B}`);
    expect(await gatesOf()).toEqual([]);
  });
});
