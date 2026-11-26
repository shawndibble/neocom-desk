import type { Page } from '@playwright/test';
import { CHARACTER_ID, CHARACTER_NAME, OWNER_HASH, SCOPES } from './fixtureData';
import { EXP_SECONDS, makeAccessToken } from './mockSso';

const BLANK_PATH = '__e2e-seed-blank';

const SEEDED_STORES = {
  characters: 'characterId',
  tokens: 'characterId',
  settings: 'key',
} as const;
const SEEDED_IDB_VERSION = 10;

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
  settings: readonly { key: string; value: unknown }[];
}

export async function signInAndGoto(
  page: Page,
  path = './overview',
  scopes: readonly string[] = SCOPES,
  extraSettings: readonly { key: string; value: unknown }[] = [],
  accessToken: string = makeAccessToken(scopes)
): Promise<void> {
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
      accessToken,
      refreshToken: 'fake-refresh',
      expiresAt: EXP_SECONDS * 1000,
      scopes: [...scopes],
    },
    settings: [
      { key: ACTIVE_CHARACTER_KEY, value: CHARACTER_ID },
      { key: 'sync.navHidden', value: [] },
      { key: 'hintCounts', value: { rowHint: 1, goTo: 1, columnPickerHint: 1 } },
      ...extraSettings,
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
      tx.objectStore('characters').put(seed.character);
      tx.objectStore('tokens').put(seed.token);
      for (const setting of seed.settings) tx.objectStore('settings').put(setting);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  }, payload);

  await page.goto(path);
}

export interface SeededWidget {
  kind: string;
  size?: 'S' | 'M' | 'L' | 'F';
  view?: 'number' | 'chart' | 'table' | 'list';
}

export function overviewLayoutSetting(widgets: readonly SeededWidget[]): {
  key: string;
  value: unknown;
} {
  return {
    key: 'sync.overviewLayout',
    value: {
      version: 1,
      widgets: widgets.map((widget, index) => ({
        id: `w${index}`,
        kind: widget.kind,
        size: widget.size ?? 'M',
        view: widget.view ?? 'number',
        scope: 'header',
        showOnPhone: true,
      })),
    },
  };
}
