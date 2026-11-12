/**
 * Stories never reach the network. `installFixtureFetch` replaces
 * `window.fetch` with a router over fixture responses; any request it has no
 * fixture for is recorded and rejected, and logged as a console error. ESI's
 * client turns a rejected request into a silent offline/empty state, so the
 * record, not the throw, is what makes a missed fixture visible:
 * `unexpectedRequests()` is asserted empty by `src/test/storySmoke.tsx`.
 *
 * Same-origin requests (the SDE bake, fonts) pass through to the real fetch.
 */
import {
  SAMPLE_CHARACTERS,
  SAMPLE_STATION_ID,
  SAMPLE_SYSTEM_ID,
  sampleCharacterPublicInfo,
} from './sampleData';

export interface FixtureRequest {
  method: string;
  url: URL;
  body: unknown;
}

export interface FixtureResponse {
  body: unknown;
  headers?: Record<string, string>;
}

export interface FixtureRoute {
  method?: 'GET' | 'POST';
  /** Matched against the URL path (no query). */
  path: string | RegExp;
  respond: (request: FixtureRequest) => FixtureResponse;
}

const unexpected: string[] = [];

/** Requests the installed router had no fixture for since the last `install`. */
export function unexpectedRequests(): readonly string[] {
  return unexpected;
}

/**
 * Every shell story seeds `SAMPLE_CHARACTERS`, and the app reads their public
 * sheets from work no one story owns (the corp identity read, public info), which
 * can run while no table that answers them is installed. A CI run recorded one as
 * unexpected (#6114), so the router answers these itself, after every installed
 * table so a story's own fixture still wins. Any other Character's sheet is still
 * recorded.
 *
 * A page's load also outlives its story: one story's `/location` or `/skillqueue`
 * read can land after the next story installed a table without it (#6126:
 * the Requests stories' location read under the next Communities story, the
 * Hauling skill queue under Market Stock). Those two get the same fallback: docked
 * at the sample station, nothing training.
 */
const SAMPLE_IDS = SAMPLE_CHARACTERS.map((c) => c.characterId).join('|');
const sampleRead = (tail: string) => new RegExp(`^/characters/(${SAMPLE_IDS})${tail}$`);
const SAMPLE_CHARACTER_READS: readonly FixtureRoute[] = [
  {
    path: sampleRead(''),
    respond: ({ url }) => ({
      body: sampleCharacterPublicInfo(Number(url.pathname.split('/').pop())),
    }),
  },
  {
    path: sampleRead('/location'),
    respond: () => ({ body: { solar_system_id: SAMPLE_SYSTEM_ID, station_id: SAMPLE_STATION_ID } }),
  },
  { path: sampleRead('/skillqueue'), respond: () => ({ body: [] }) },
];

function matches(route: FixtureRoute, method: string, path: string): boolean {
  if ((route.method ?? 'GET') !== method) return false;
  return typeof route.path === 'string' ? route.path === path : route.path.test(path);
}

async function readBody(init: RequestInit | undefined): Promise<unknown> {
  if (typeof init?.body !== 'string') return undefined;
  try {
    return JSON.parse(init.body);
  } catch {
    return init.body;
  }
}

let original: typeof globalThis.fetch | undefined;
/** Route tables of every installed story; stories on one docs page overlap. */
const installed = new Set<readonly FixtureRoute[]>();
let lastActivity = 0;

/** Resolves once no request has gone through the fixture fetch for `quietMs`. */
export async function whenFetchQuiet(quietMs = 300): Promise<void> {
  while (Date.now() - lastActivity < quietMs) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function fixtureFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  lastActivity = Date.now();
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    globalThis.location?.href
  );
  if (globalThis.location && url.origin === globalThis.location.origin) {
    return original!(input, init);
  }
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const route = [...[...installed].flat(), ...SAMPLE_CHARACTER_READS].find((candidate) =>
    matches(candidate, method, url.pathname)
  );
  if (!route) {
    const label = `${method} ${url.origin}${url.pathname}`;
    unexpected.push(label);
    console.error(`Story reached the network with no fixture: ${label}`);
    throw new TypeError(`Story reached the network with no fixture: ${label}`);
  }
  const { body, headers } = route.respond({ method, url, body: await readBody(init) });
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** Returns an uninstall function; the real `fetch` returns when the last story uninstalls. */
export function installFixtureFetch(routes: readonly FixtureRoute[]): () => void {
  if (installed.size === 0) {
    original = globalThis.fetch;
    globalThis.fetch = fixtureFetch;
  }
  unexpected.length = 0;
  const mine = [...routes];
  installed.add(mine);
  return () => {
    installed.delete(mine);
    if (installed.size === 0 && original) {
      globalThis.fetch = original;
      original = undefined;
    }
  };
}
