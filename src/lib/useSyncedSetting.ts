/**
 * Factory for a **cross-device** preference: `createLocalSetting`'s store,
 * backed by one `sync.`-prefixed Dexie key that `planSync.ts` merges with the
 * pilot's other devices.
 *
 * The returned store is the same `LocalSettingStore<T>` — value, `hydrated`,
 * `hydrate`, `setValue` — on purpose. A page reading a default should not have
 * to know whether it travels, and every existing consumer of these five
 * preferences was written against that shape.
 *
 * ## What a write does
 *
 * Three things, in this order and for these reasons:
 *
 * 1. `db.settings.put` directly. `setSyncedSetting` lives behind `@/sync`'s
 *    lazy Firebase chunk (~160 KB, see `sync/index.ts`), and a chunk that
 *    fails to load — offline before it was precached — must not cost the pilot
 *    the choice they just made. The row is on disk either way, and a row with
 *    no timestamp still pushes on the next sync (planSync stamps it `now`).
 * 2. `setSyncedSetting`, which rewrites the same row and stamps it for
 *    last-write-wins merging. Failures are swallowed: see above.
 * 3. `scheduleSync` for **every** Character on the device, not the active one.
 *    A synced setting is device-global while sync itself is per-Character —
 *    each Character syncs under its own uid and ownerHash — so pushing under
 *    only one leaves a device that holds only the *other* Character never
 *    seeing the change. This is the fan-out `setAccountStationPin` and
 *    `setPlanetRichness` already do for account-wide data.
 *
 * ## What a pull does
 *
 * `planSync` writes pulled settings straight into Dexie, behind the store's
 * back, so the store re-reads on every successful sync (`subscribeSyncStatus`,
 * which is Firebase-free and safe to import synchronously). A re-read is
 * discarded if a press lands while it is in flight, and every value it finds
 * goes through the same `parse` a hydrate would: what comes back was written
 * by another device, possibly an older build, and an out-of-range
 * `industryAssumedMe` would reach the industry engine, which throws on one.
 * `features/pi/customsOverride.ts` validates pulled values for the same reason.
 *
 * ## Adopting the value the preference had before it synced
 *
 * `legacyKey` names the plain Dexie key this preference used as a device-local
 * setting. When the `sync.` row is absent and the legacy one is not, its value
 * is adopted and seeded — with a **bare put, deliberately not
 * `setSyncedSetting`**. Stamping it `Date.now()` would make a value this
 * device may have set months ago outrank a real edit made on another device
 * yesterday; unstamped, it reads as `updatedAt: 0` and `mergeSettings` lets
 * any remote copy win. With no remote copy it pushes as-is, which is exactly
 * the migration.
 *
 * The legacy row is left in place rather than deleted, so an older bundle
 * still served from the PWA cache keeps reading its own value instead of
 * silently reverting to the default.
 */
import { db } from '@/db';
import { isSyncConfigured } from '@/app/syncStatus';
// Both leaf modules rather than the `@/sync` barrel, and not for weight —
// `syncedSettings` is a string Set and `status` a listener list, neither of
// which reaches Firebase either way. The allow-list check runs at *module
// scope*, so routing it through the barrel would make five preference stores
// fail to initialize in any suite that mocks `@/sync` with a factory (several
// do), for a check that has nothing to do with what those suites are mocking.
// Only the two functions that must load the sync driver come from the barrel.
import { isAllowedSyncedSettingKey } from '@/sync/syncedSettings';
import { subscribeSyncStatus } from '@/sync/status';
import { scheduleSync, setSyncedSetting } from '@/sync';
import { createSettingStore, type StoredRow } from './settingStore';
import { settingCoercer, type LocalSettingStore } from './useLocalSetting';

const SYNCED_PREFIX = 'sync.';

export interface SyncedSettingOptions<T> {
  /** Dexie `settings` key. Must start with `sync.` and be on `SYNCED_SETTING_KEYS`. */
  key: string;
  /**
   * The plain key this preference was stored under before it synced. Its value
   * is adopted once, if the synced key holds nothing; omit for a preference
   * that never had a device-local life.
   */
  legacyKey?: string;
  defaultValue: T;
  /** Same contract as `createLocalSetting`'s — and run over pulled values too. */
  parse?: (raw: unknown) => T | null;
  /** Side effect on every applied value, hydration and pulls included. */
  onApply?: (value: T) => void;
}

export function createSyncedSetting<T>(options: SyncedSettingOptions<T>): LocalSettingStore<T> {
  const { key, legacyKey, defaultValue, parse, onApply } = options;

  if (!key.startsWith(SYNCED_PREFIX)) {
    throw new Error(`Synced settings keys must start with '${SYNCED_PREFIX}' (got '${key}')`);
  }
  if (!isAllowedSyncedSettingKey(key)) {
    throw new Error(
      `'${key}' is not on the synced-settings allow-list. Add it to SYNCED_SETTING_KEYS ` +
        `in src/sync/syncedSettings.ts (and its pinned test).`
    );
  }
  if (legacyKey?.startsWith(SYNCED_PREFIX)) {
    throw new Error(`A legacy key is the pre-sync device-local one (got '${legacyKey}')`);
  }

  // At most one adoption per session. After it the synced row exists, so the
  // branch is unreachable anyway; the flag is what stops a re-read from
  // resurrecting the legacy value if the synced row ever went away underneath
  // us. Set only when something was actually adopted — a device that had no
  // legacy row has adopted nothing, and nothing to guard against.
  let adopted = false;

  async function read(): Promise<StoredRow | undefined> {
    const row = await db.settings.get(key);
    if (row !== undefined) return row;
    if (legacyKey === undefined || adopted) return undefined;
    const legacy = await db.settings.get(legacyKey);
    if (legacy === undefined) return undefined;
    adopted = true;
    // Unstamped on purpose — see the module comment.
    await db.settings.put({ key, value: legacy.value });
    return legacy;
  }

  async function write(value: T): Promise<void> {
    await db.settings.put({ key, value });
    if (!isSyncConfigured()) return;
    try {
      await setSyncedSetting(key, value);
      const characters = await db.characters.toArray();
      for (const character of characters) scheduleSync(character.characterId);
    } catch {
      // The choice is already on disk; the next successful sync pushes it.
    }
  }

  function subscribeExternal(reread: () => void): void {
    if (!isSyncConfigured()) return;
    let seenAt: number | null = null;
    subscribeSyncStatus((status) => {
      if (status.state !== 'idle' || status.lastSyncedAt === null) return;
      if (status.lastSyncedAt === seenAt) return;
      seenAt = status.lastSyncedAt;
      reread();
    });
  }

  return createSettingStore<T>({
    defaultValue,
    onApply,
    coerce: settingCoercer(defaultValue, parse),
    read,
    write,
    subscribeExternal,
  });
}
