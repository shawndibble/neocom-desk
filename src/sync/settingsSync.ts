import { collection, deleteDoc, doc } from 'firebase/firestore/lite';
import { db } from '@/db';
import { INTERNAL_PREFIX, settingsSeenSeqKey, writePullCursor } from './localBookkeeping';
import {
  mergeSettings,
  type RemoteSyncedSetting,
  type SyncedSettingTombstone,
  type SyncedSettingValue,
} from './merge';
import { SYNCED_SETTINGS } from './syncedCollections';
import { pullOwnedDocs, setOwnedDoc, type SyncContext } from './collectionSync';

// Local bookkeeping (Dexie settings table). 'sync.__' keys are internal and
// never synced; 'sync.' keys are the user settings that DO sync.
// ---------------------------------------------------------------------------

export const SYNCED_PREFIX = 'sync.';
// Key builders (ownerHashKey, tombstoneKey) live in localBookkeeping.ts,
// Firebase-free, so features/character/removeCharacter.ts can clear them
// without pulling in Firebase.
export const SETTINGS_META_KEY = `${INTERNAL_PREFIX}settingsMeta`;
// Synced settings are a single global set (not per-character, like plans), so
// their tombstones live under one global key too — a delete recorded during
// one character's sync must be visible on every other character's pass.
export const SETTINGS_TOMBSTONES_KEY = `${INTERNAL_PREFIX}settingsTombstones`;
/**
 * Bumped each time a pass writes a pulled or deleted setting into Dexie
 * (issue #5045). A Character whose `settingsSeenSeqKey` lags it reads in full:
 * see syncSettings.
 */
export const SETTINGS_APPLIED_SEQ_KEY = `${INTERNAL_PREFIX}settingsAppliedSeq`;

export function isSyncedSettingKey(key: string): boolean {
  return key.startsWith(SYNCED_PREFIX) && !key.startsWith(INTERNAL_PREFIX);
}

export async function readSettingsMeta(): Promise<Record<string, number>> {
  const record = await db.settings.get(SETTINGS_META_KEY);
  return record && typeof record.value === 'object' && record.value !== null
    ? { ...(record.value as Record<string, number>) }
    : {};
}

export async function writeSettingsMeta(meta: Record<string, number>): Promise<void> {
  await db.settings.put({ key: SETTINGS_META_KEY, value: meta });
}

export async function readSettingsTombstones(): Promise<SyncedSettingTombstone[]> {
  const record = await db.settings.get(SETTINGS_TOMBSTONES_KEY);
  return Array.isArray(record?.value) ? (record.value as SyncedSettingTombstone[]) : [];
}

export async function writeSettingsTombstones(tombstones: SyncedSettingTombstone[]): Promise<void> {
  await db.settings.put({ key: SETTINGS_TOMBSTONES_KEY, value: tombstones });
}

// ---------------------------------------------------------------------------
// Synced settings
// ---------------------------------------------------------------------------

export async function syncSettings(ctx: SyncContext): Promise<void> {
  const { firestore, uid, ownerHash, now } = ctx;
  const settingsCol = collection(firestore, 'characters', uid, SYNCED_SETTINGS.remoteName);
  const meta = await readSettingsMeta();
  const settingsTombstones = await readSettingsTombstones();
  const localSettings: SyncedSettingValue[] = (await db.settings.toArray())
    .filter((record) => isSyncedSettingKey(record.key))
    .map((record) => ({ key: record.key, value: record.value, updatedAt: meta[record.key] ?? 0 }));
  const appliedSeq = await readSeq(SETTINGS_APPLIED_SEQ_KEY);

  // Incremental like every editable collection (issue #5045): a pass with no
  // settings changes costs one read, not one per synced key. Two local states
  // a window cannot reconcile force a full read instead:
  //   - an unstamped value (useSyncedSetting's seed) must lose to any remote
  //     copy, which only a full read can show. A one-off: the pass stamps it.
  //   - a value another Character's pass pulled (or deleted) since this
  //     Character's last pass. Local settings are one set for every
  //     Character but each Character's remote collection and cursor are its
  //     own, so a relayed value can carry a stamp below this cursor, and the
  //     window would read it as already pushed here. Only happens when
  //     another device actually changed a setting.
  const forceFull =
    localSettings.some((s) => !(s.updatedAt > 0)) ||
    appliedSeq !== (await readSeq(settingsSeenSeqKey(ctx.characterId)));
  const pull = await pullOwnedDocs<RemoteSyncedSetting & { ownerHash: string }>(
    settingsCol,
    ctx,
    SYNCED_SETTINGS.remoteName,
    forceFull
  );
  // Only honour well-formed synced keys: a hostile or stale doc naming a
  // non-synced Dexie key ('activeCharacterId') or an internal 'sync.__' key
  // must never reach Dexie.
  const remoteSettings = pull.remote.filter(
    (s) => typeof s.key === 'string' && isSyncedSettingKey(s.key)
  );

  const settings = mergeSettings(
    localSettings,
    settingsTombstones,
    remoteSettings,
    now,
    pull.since
  );
  /** The applied-seq this Character has now reconciled against, recorded with the cursor. */
  let seenSeq = appliedSeq;
  /** Whether the apply below dropped a pull or delete a mid-pass local write overtook. */
  let skipped = false;
  /** LWW stamps this pass wants to record, applied under the transaction below. */
  const stamps = new Map<string, number>();

  if (settings.push.length > 0 || settings.pushTombstones.length > 0) ctx.onPush?.();
  await Promise.all([
    ...settings.push.map((s) => {
      // A key written outside setSyncedSetting has no timestamp yet: stamp now.
      const updatedAt = s.updatedAt > 0 ? s.updatedAt : now;
      if (meta[s.key] !== updatedAt) stamps.set(s.key, updatedAt);
      return setOwnedDoc(doc(settingsCol, s.key), {
        key: s.key,
        value: s.value,
        updatedAt,
        ownerHash,
        deleted: false,
      });
    }),
    ...settings.pushTombstones.map((t) =>
      // No `value` field — Firestore rejects undefined, and a tombstone carries none.
      setOwnedDoc(doc(settingsCol, t.key), {
        key: t.key,
        updatedAt: t.deletedAt,
        ownerHash,
        deleted: true,
      })
    ),
    ...settings.purgeRemote.map((key) => deleteDoc(doc(settingsCol, key))),
  ]);

  // One transaction for the whole pull rather than a put/delete per key: the
  // rows and their LWW stamps land together, and a live query over settings
  // re-runs once instead of once per row. Dexie only inside it — an awaited
  // Firestore call would let the transaction auto-commit early.
  //
  // The meta is re-read inside it: the merge above worked from a snapshot
  // taken before the network round trips, and a setSyncedSetting /
  // deleteSyncedSetting landing in between must neither be overwritten by the
  // pull nor lose its stamp. A key whose stamp moved since the snapshot is
  // left alone; the next pass merges it properly.
  if (settings.pull.length > 0 || settings.deleteLocal.length > 0 || stamps.size > 0) {
    await db.transaction('rw', db.settings, async () => {
      const current = await readSettingsMeta();
      const untouched = (key: string) => current[key] === meta[key];
      const pull = settings.pull.filter((s) => untouched(s.key));
      const deleteLocal = settings.deleteLocal.filter(untouched);
      skipped =
        pull.length < settings.pull.length || deleteLocal.length < settings.deleteLocal.length;
      if (pull.length > 0 || deleteLocal.length > 0) {
        // Tell every other Character's next pass to read in full. This one has
        // seen its own change — unless another pass bumped the seq meanwhile.
        const current = await readSeq(SETTINGS_APPLIED_SEQ_KEY);
        await db.settings.put({ key: SETTINGS_APPLIED_SEQ_KEY, value: current + 1 });
        if (current === appliedSeq) seenSeq = current + 1;
      }
      let dirty = false;
      for (const [key, updatedAt] of stamps) {
        if (!untouched(key)) continue;
        current[key] = updatedAt;
        dirty = true;
      }
      for (const s of pull) {
        current[s.key] = s.updatedAt;
        dirty = true;
      }
      for (const key of deleteLocal) {
        if (key in current) {
          delete current[key];
          dirty = true;
        }
      }
      if (pull.length > 0) {
        await db.settings.bulkPut(pull.map((s) => ({ key: s.key, value: s.value })));
      }
      if (deleteLocal.length > 0) await db.settings.bulkDelete(deleteLocal);
      if (dirty) await writeSettingsMeta(current);
    });
  }

  // Do NOT also clear on settings.pushTombstones: a tombstone that was just
  // pushed is not yet resolved — see mergeSettings for why it must survive
  // until a remote write postdates the delete.
  if (settings.clearLocalTombstones.length > 0) {
    const cleared = new Set(settings.clearLocalTombstones);
    await writeSettingsTombstones(settingsTombstones.filter((t) => !cleared.has(t.key)));
  }

  // Last, once every write above landed (a throw leaves the cursor alone), and
  // not at all if the apply dropped a remote doc: advancing past it would hide
  // it from every later window, so the next pass re-reads the same one.
  if (!skipped) {
    await writePullCursor(pull.cursorKey, pull.next);
    await db.settings.put({ key: settingsSeenSeqKey(ctx.characterId), value: seenSeq });
  }
}

async function readSeq(key: string): Promise<number> {
  const value = (await db.settings.get(key))?.value;
  return typeof value === 'number' ? value : 0;
}
