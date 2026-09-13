/**
 * Seeds the app's own IndexedDB rather than mocking HTTP.
 *
 * Every `features/*` loader reads through `src/esi/cache.ts`, which serves a
 * row whose `fetchedAt` is inside its freshness window WITHOUT making a live
 * call — boot prefetch included (`src/app/prefetch.ts` calls the same
 * loaders, so it is idempotent against a warm cache). Seeding rows therefore
 * removes the network from the picture entirely, instead of reproducing
 * fifteen ESI response shapes behind route handlers.
 *
 * Raw IndexedDB, not Dexie, for the same reason `e2e/support/login.ts` uses
 * it: this runs inside the page before the app's module graph is reachable
 * from the test.
 */
import type { Page } from '@playwright/test';
import { makeAccessToken } from './jwt';
import {
  CHARACTER_ID,
  CHARACTER_NAME,
  CORPORATION_ID,
  OWNER_HASH,
  SCOPES,
  TOKEN_EXPIRES_AT,
} from './identity';

/** One `esiCache` row: `[characterId+key]` -> value. */
export interface CacheRow {
  characterId: number;
  key: string;
  value: unknown;
  /** Paginated loaders store a plain array plus this flag (cache.ts:619). */
  truncated?: boolean;
}

export interface SeedPayload {
  cacheRows: CacheRow[];
  /** Rows for editable Dexie tables, keyed by table name. */
  tables: Record<string, unknown[]>;
  /** `settings` rows written on top of the active-character selection. */
  settings: { key: string; value: unknown }[];
}

/**
 * Boots the app once so Dexie creates the database at its current version,
 * writes the fixture, then reloads into a fully-populated session.
 */
export async function seedAndBoot(page: Page, payload: SeedPayload): Promise<void> {
  // First load creates the schema. No character yet, so this lands on /login.
  await page.goto('./');
  await page.waitForFunction(() => indexedDB.databases().then((d) => d.some((x) => x.name === 'neocom')));

  await page.evaluate(
    async ({ payload, identity }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('neocom');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      const existing = new Set(Array.from(database.objectStoreNames));
      const writes: Record<string, unknown[]> = {
        characters: [
          {
            characterId: identity.characterId,
            name: identity.characterName,
            ownerHash: identity.ownerHash,
            addedAt: Date.now() - 86_400_000 * 120,
            corporationId: identity.corporationId,
          },
        ],
        tokens: [
          {
            characterId: identity.characterId,
            accessToken: identity.accessToken,
            refreshToken: 'showcase-refresh',
            expiresAt: identity.tokenExpiresAt,
            scopes: identity.scopes,
          },
        ],
        settings: [
          { key: 'activeCharacterId', value: identity.characterId },
          ...payload.settings,
        ],
        // `fetchedAt` is stamped here, at seed time, so every row is inside
        // its freshness window however long the harness took to get here.
        esiCache: payload.cacheRows.map((row) => ({
          characterId: row.characterId,
          key: row.key,
          value: row.value,
          fetchedAt: Date.now(),
          ...(row.truncated === undefined ? {} : { truncated: row.truncated }),
        })),
        ...payload.tables,
      };

      for (const [storeName, rows] of Object.entries(writes)) {
        if (!existing.has(storeName) || rows.length === 0) continue;
        await new Promise<void>((resolve, reject) => {
          const tx = database.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          for (const row of rows) store.put(row);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
      database.close();
    },
    {
      payload,
      identity: {
        characterId: CHARACTER_ID,
        characterName: CHARACTER_NAME,
        ownerHash: OWNER_HASH,
        corporationId: CORPORATION_ID,
        accessToken: makeAccessToken(),
        tokenExpiresAt: TOKEN_EXPIRES_AT,
        scopes: [...SCOPES],
      },
    }
  );

  await page.reload();
}
