/**
 * Writes the three IndexedDB rows a completed login leaves behind, so a spec
 * can start already signed in instead of driving the mocked SSO round trip.
 *
 * Why this exists: `loginAndSelectCharacter` costs two **full page loads**,
 * not two clicks. The landing page is one, and the SSO redirect back to
 * `/callback` is another — measured at ~1.4s each locally and proportionally
 * more on a CI runner, against ~0.17s for the client-side hop from
 * `/characters` to `/overview`. Nearly every spec then calls `page.goto()` for
 * the route it actually cares about, which is a third. Seeding collapses that
 * to one: the route under test.
 *
 * What it does NOT replace: `auth.spec.ts`, which drives the real flow and is
 * the only thing proving login still works. Everything else was paying for
 * that proof 89 more times.
 */
import type { Page } from '@playwright/test';
import { CHARACTER_ID, CHARACTER_NAME, OWNER_HASH, SCOPES } from './fixtureData';
import { EXP_SECONDS, makeAccessToken } from './mockSso';

/**
 * A same-origin page that runs no app code.
 *
 * The seed has to execute in the app's origin (IndexedDB is origin-scoped)
 * but *before* the app's Dexie opens the database, and those two requirements
 * rule out the obvious approaches. `page.addInitScript` is not awaited before
 * page scripts run, so its `indexedDB.open` races the app's and loses with a
 * `VersionError`. Any real app URL boots the app, which is the page load being
 * removed. A route fulfilled with an empty document is neither: correct
 * origin, no scripts, no request to either server.
 */
const BLANK_PATH = '__e2e-seed-blank';

/**
 * The store names and key paths this seed writes, at the schema version they
 * were introduced with — `db.version(1)` in `src/db/index.ts`, unchanged since.
 *
 * Deliberately only three of the eighteen stores the app now declares, and
 * deliberately an *old* version. Dexie derives its IndexedDB version as
 * `dexieVersion * 10`, so a database left at 10 reads as "v1" and the app's
 * own `db.version(13)` chain upgrades it on open — creating the fifteen
 * missing stores and the later indexes exactly as it does for a returning
 * user. That keeps this file ignorant of the other stores instead of
 * restating a schema that changes most months. None of the version steps
 * carries an `.upgrade()` callback, so the migration is pure structure.
 */
const SEEDED_STORES = {
  characters: 'characterId',
  tokens: 'characterId',
  settings: 'key',
} as const;
const SEEDED_IDB_VERSION = 10;

/** Mirrors `src/stores/activeCharacter.ts`'s `ACTIVE_CHARACTER_KEY`. */
const ACTIVE_CHARACTER_KEY = 'activeCharacterId';

interface SeedPayload {
  stores: Record<string, string>;
  idbVersion: number;
  character: { characterId: number; name: string; ownerHash: string; addedAt: number };
  token: {
    characterId: number;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
  };
  setting: { key: string; value: number };
}

/**
 * Sign in without the SSO round trip, then land on `path`.
 *
 * Drop-in for `loginAndSelectCharacter(page)` followed by
 * `page.goto(path)` — pass the route the spec actually asserts against, or
 * omit it for `/overview`, which is where the real flow ends up.
 */
export async function signInAndGoto(page: Page, path = './overview'): Promise<void> {
  await page.route(`**/${BLANK_PATH}`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>seed</title>' })
  );
  await page.goto(`./${BLANK_PATH}`);

  const payload: SeedPayload = {
    stores: SEEDED_STORES,
    idbVersion: SEEDED_IDB_VERSION,
    character: {
      characterId: CHARACTER_ID,
      name: CHARACTER_NAME,
      ownerHash: OWNER_HASH,
      addedAt: Date.now(),
    },
    token: {
      characterId: CHARACTER_ID,
      accessToken: makeAccessToken(),
      refreshToken: 'fake-refresh',
      expiresAt: EXP_SECONDS * 1000,
      scopes: [...SCOPES],
    },
    setting: { key: ACTIVE_CHARACTER_KEY, value: CHARACTER_ID },
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
      tx.objectStore('characters').put(seed.character);
      tx.objectStore('tokens').put(seed.token);
      tx.objectStore('settings').put(seed.setting);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    // Closed explicitly: an open connection at the old version blocks the
    // app's upgrade to 13, which would hang the very next navigation.
    database.close();
  }, payload);

  await page.goto(path);
}
