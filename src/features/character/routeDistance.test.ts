import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import type { EsiRouteRules } from '@/features/route/esiRoute';
import { loadJumpsAway } from './routeDistance';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  await db.esiCache.clear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const JITA = 30000142;
const AMARR = 30002187;
const UEDAMA = 30045328;
const SIVALA = 30003068;
const ROUTE_URL = `${ESI_BASE_URL}/route/${JITA}/${AMARR}`;

const SHORTEST: EsiRouteRules = { preference: 'shortest', securityPenalty: 50, avoid: [] };

interface RouteBody {
  preference?: string;
  security_penalty?: number;
  avoid_systems?: number[];
}

/** Answers every route request with `route`, recording each body it was sent. */
function answerWith(route: number[] | ((body: RouteBody) => Response)) {
  const bodies: RouteBody[] = [];
  server.use(
    http.post(ROUTE_URL, async ({ request }) => {
      const body = (await request.json()) as RouteBody;
      bodies.push(body);
      return typeof route === 'function' ? route(body) : HttpResponse.json({ route });
    })
  );
  return bodies;
}

describe('loadJumpsAway', () => {
  it('is 0 jumps without a network call when origin and destination are the same system', async () => {
    const result = await loadJumpsAway(JITA, JITA, SHORTEST);
    expect(result).toEqual({ kind: 'known', jumps: 0 });
  });

  it('resolves jumps from the ESI route waypoint list', async () => {
    answerWith([JITA, 30002053, AMARR]);

    const result = await loadJumpsAway(JITA, AMARR, SHORTEST);

    expect(result).toEqual({ kind: 'known', jumps: 2 });
  });

  it("sends each preference in ESI's own words, with the security penalty", async () => {
    const bodies = answerWith([JITA, AMARR]);

    await loadJumpsAway(JITA, AMARR, {
      ...SHORTEST,
      preference: 'prefer-highsec',
      securityPenalty: 70,
    });
    await loadJumpsAway(JITA, AMARR, {
      ...SHORTEST,
      preference: 'avoid-highsec',
      securityPenalty: 20,
    });

    expect(bodies).toEqual([
      { preference: 'Safer', security_penalty: 70 },
      { preference: 'LessSecure', security_penalty: 20 },
    ]);
  });

  it('leaves the penalty out of a Shorter route, which it cannot bend', async () => {
    const bodies = answerWith([JITA, AMARR]);

    await loadJumpsAway(JITA, AMARR, SHORTEST);

    expect(bodies).toEqual([{ preference: 'Shorter' }]);
  });

  it('returns unknown/noRoute when the route cannot be resolved', async () => {
    server.use(http.post(`${ESI_BASE_URL}/route/${JITA}/30999999`, () => HttpResponse.error()));

    const result = await loadJumpsAway(JITA, 30999999, SHORTEST);

    expect(result).toEqual({ kind: 'unknown', reason: 'noRoute' });
  });

  it('never reuses a distance cached under a different penalty', async () => {
    answerWith((body) =>
      HttpResponse.json({
        route: body.security_penalty === 90 ? [JITA, 1, 2, 3, AMARR] : [JITA, UEDAMA, AMARR],
      })
    );
    const safer: EsiRouteRules = { ...SHORTEST, preference: 'prefer-highsec' };

    expect(await loadJumpsAway(JITA, AMARR, { ...safer, securityPenalty: 10 })).toEqual({
      kind: 'known',
      jumps: 2,
    });
    expect(await loadJumpsAway(JITA, AMARR, { ...safer, securityPenalty: 90 })).toEqual({
      kind: 'known',
      jumps: 4,
    });
  });
});

describe('loadJumpsAway with Avoided Systems', () => {
  it('sends the list as avoid_systems, leaving out the two ends', async () => {
    const bodies = answerWith([JITA, 30002053, AMARR]);

    await loadJumpsAway(JITA, AMARR, { ...SHORTEST, avoid: [UEDAMA, JITA, SIVALA, AMARR] });

    expect(bodies[0].avoid_systems).toEqual([SIVALA, UEDAMA]);
  });

  /*
   * ESI's avoid list is a hard filter (verified live: 404 "No route found"
   * when the only way runs through an avoided system). The local graph treats
   * avoidance as a cost, never a wall — so this falls back to the unfiltered
   * route rather than calling a reachable station unreachable.
   */
  it('falls back to the plain route when avoiding leaves none', async () => {
    const bodies = answerWith((body) =>
      body.avoid_systems
        ? HttpResponse.json({ error: 'No route found' }, { status: 404 })
        : HttpResponse.json({ route: [JITA, UEDAMA, AMARR] })
    );

    const result = await loadJumpsAway(JITA, AMARR, { ...SHORTEST, avoid: [UEDAMA] });

    expect(result).toEqual({ kind: 'known', jumps: 2 });
    expect(bodies.map((body) => body.avoid_systems)).toEqual([[UEDAMA], undefined]);
  });

  it('never reuses a distance cached under a different list', async () => {
    answerWith((body) =>
      HttpResponse.json({
        route: body.avoid_systems
          ? [JITA, 30002053, 30002054, 30002055, AMARR]
          : [JITA, UEDAMA, AMARR],
      })
    );

    expect(await loadJumpsAway(JITA, AMARR, SHORTEST)).toEqual({ kind: 'known', jumps: 2 });
    expect(await loadJumpsAway(JITA, AMARR, { ...SHORTEST, avoid: [UEDAMA] })).toEqual({
      kind: 'known',
      jumps: 4,
    });
  });
});
