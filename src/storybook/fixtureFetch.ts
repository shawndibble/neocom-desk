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
  path: string | RegExp;
  respond: (request: FixtureRequest) => FixtureResponse;
}

const unexpected: { request: string; owner: string | undefined }[] = [];
let currentOwner: () => string | undefined = () => undefined;

export function attributeRequestsTo(owner: () => string | undefined): () => void {
  currentOwner = owner;
  return () => {
    currentOwner = () => undefined;
  };
}

export function unexpectedRequests(owner?: string): readonly string[] {
  return unexpected
    .filter((entry) => owner === undefined || entry.owner === owner)
    .map((entry) => entry.request);
}

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
const installed = new Set<readonly FixtureRoute[]>();
const retiring = new Set<readonly FixtureRoute[]>();
let lastActivity = 0;
let lastRequest = '';

async function pollUntil(done: () => boolean): Promise<void> {
  while (!done()) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export async function whenFetchQuiet(quietMs = 300): Promise<void> {
  await pollUntil(() => Date.now() - lastActivity >= quietMs);
}

export async function whenFixturesRetired(timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  await pollUntil(() => retiring.size === 0 || Date.now() >= deadline);
  if (retiring.size > 0) {
    throw new Error(
      `Fixture fetch still busy ${timeoutMs}ms after its story unmounted; last request: ${lastRequest}`
    );
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
  lastRequest = `${method} ${url.origin}${url.pathname}`;
  const route = [...[...installed, ...retiring].flat(), ...SAMPLE_CHARACTER_READS].find(
    (candidate) => matches(candidate, method, url.pathname)
  );
  if (!route) {
    unexpected.push({ request: lastRequest, owner: currentOwner() });
    console.error(`Story reached the network with no fixture: ${lastRequest}`);
    throw new TypeError(`Story reached the network with no fixture: ${lastRequest}`);
  }
  const { body, headers } = route.respond({ method, url, body: await readBody(init) });
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function restoreIfIdle() {
  if (installed.size === 0 && retiring.size === 0 && original) {
    globalThis.fetch = original;
    original = undefined;
  }
}

export function installFixtureFetch(routes: readonly FixtureRoute[]): () => void {
  if (!original) {
    original = globalThis.fetch;
    globalThis.fetch = fixtureFetch;
  }
  unexpected.length = 0;
  const mine = [...routes];
  installed.add(mine);
  return () => {
    if (!installed.delete(mine)) return;
    retiring.add(mine);
    void whenFetchQuiet().then(() => {
      retiring.delete(mine);
      restoreIfIdle();
    });
  };
}
