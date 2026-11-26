/**
 * Multi-character variant of e2e/support/authSeed.ts's `signInAndGoto` (which seeds exactly one
 * character): writes a `characters` and a `tokens` row for every cast member, the active
 * character setting and any extra settings rows, into the app's IndexedDB before the app opens
 * it, then navigates. See authSeed.ts for why the write goes through a blank same-origin page.
 */
import type { Page } from '@playwright/test';
import { EXP_SECONDS } from '../../../../e2e/support/mockSso';
import { CAST, type CastMember } from './cast';

const BLANK_PATH = '__world-seed-blank';
const SEEDED_STORES = { characters: 'characterId', tokens: 'characterId', settings: 'key' } as const;
const SEEDED_IDB_VERSION = 10;
const ACTIVE_CHARACTER_KEY = 'activeCharacterId';

function base64url(json: unknown): string {
  return Buffer.from(JSON.stringify(json), 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** An unsigned access token for one cast member (src/auth/jwt.ts does no signature check). */
export function accessTokenFor(member: CastMember, scopes: readonly string[]): string {
  const header = base64url({ alg: 'RS256', typ: 'JWT' });
  const payload = base64url({
    sub: `CHARACTER:EVE:${member.id}`,
    name: member.name,
    owner: member.ownerHash,
    exp: EXP_SECONDS,
    scp: [...scopes],
    iss: 'login.eveonline.com',
  });
  return `${header}.${payload}.fakesig`;
}

interface SeedPayload {
  stores: Record<string, string>;
  idbVersion: number;
  characters: { characterId: number; name: string; ownerHash: string; addedAt: number }[];
  tokens: {
    characterId: number;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
  }[];
  settings: readonly { key: string; value: unknown }[];
}

export async function seedWorldAndGoto(
  page: Page,
  path: string,
  options: {
    activeId: number;
    scopes: readonly string[];
    settings: readonly { key: string; value: unknown }[];
  }
): Promise<void> {
  await page.route(`**/${BLANK_PATH}`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>seed</title>' })
  );
  await page.goto(`./${BLANK_PATH}`);
  const now = Date.now();
  const payload: SeedPayload = {
    stores: SEEDED_STORES,
    idbVersion: SEEDED_IDB_VERSION,
    // Added oldest-first: the main a long time ago, the alts after.
    characters: CAST.map((member, index) => ({
      characterId: member.id,
      name: member.name,
      ownerHash: member.ownerHash,
      addedAt: now - (400 - index * 60) * 86_400_000,
    })),
    tokens: CAST.map((member) => ({
      characterId: member.id,
      accessToken: accessTokenFor(member, options.scopes),
      refreshToken: `fake-refresh-${member.id}`,
      expiresAt: EXP_SECONDS * 1000,
      scopes: [...options.scopes],
    })),
    settings: [
      { key: ACTIVE_CHARACTER_KEY, value: options.activeId },
      { key: 'sync.navHidden', value: [] },
      { key: 'hintCounts', value: { rowHint: 1, goTo: 1, columnPickerHint: 1 } },
      ...options.settings,
    ],
  };
  await page.evaluate(async (seed: SeedPayload) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('neocom', seed.idbVersion);
      request.onupgradeneeded = () => {
        for (const [name, keyPath] of Object.entries(seed.stores)) {
          request.result.createObjectStore(name, { keyPath });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(Object.keys(seed.stores), 'readwrite');
      for (const character of seed.characters) tx.objectStore('characters').put(character);
      for (const token of seed.tokens) tx.objectStore('tokens').put(token);
      for (const setting of seed.settings) tx.objectStore('settings').put(setting);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  }, payload);
  await page.goto(path);
}
