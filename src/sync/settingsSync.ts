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

export const SYNCED_PREFIX = 'sync.';
export const SETTINGS_META_KEY = `${INTERNAL_PREFIX}settingsMeta`;
export const SETTINGS_TOMBSTONES_KEY = `${INTERNAL_PREFIX}settingsTombstones`;
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

export async function syncSettings(ctx: SyncContext): Promise<void> {
  const { firestore, uid, ownerHash, now } = ctx;
  const settingsCol = collection(firestore, 'characters', uid, SYNCED_SETTINGS.remoteName);
  const meta = await readSettingsMeta();
  const settingsTombstones = await readSettingsTombstones();
  const localSettings: SyncedSettingValue[] = (await db.settings.toArray())
    .filter((record) => isSyncedSettingKey(record.key))
    .map((record) => ({ key: record.key, value: record.value, updatedAt: meta[record.key] ?? 0 }));
  const appliedSeq = await readSeq(SETTINGS_APPLIED_SEQ_KEY);

  const forceFull =
    localSettings.some((s) => !(s.updatedAt > 0)) ||
    appliedSeq !== (await readSeq(settingsSeenSeqKey(ctx.characterId)));
  const pull = await pullOwnedDocs<RemoteSyncedSetting & { ownerHash: string }>(
    settingsCol,
    ctx,
    SYNCED_SETTINGS.remoteName,
    forceFull
  );
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
  let seenSeq = appliedSeq;
  let skipped = false;
  const stamps = new Map<string, number>();

  if (settings.push.length > 0 || settings.pushTombstones.length > 0) ctx.onPush?.();
  await Promise.all([
    ...settings.push.map((s) => {
      const updatedAt = s.updatedAt > 0 ? s.updatedAt : now;
      if (meta[s.key] !== updatedAt) stamps.set(s.key, updatedAt);
      return setOwnedDoc(
        doc(settingsCol, s.key),
        {
          key: s.key,
          value: s.value,
          updatedAt,
          ownerHash,
          deleted: false,
        },
        ctx
      );
    }),
    ...settings.pushTombstones.map((t) =>
      setOwnedDoc(
        doc(settingsCol, t.key),
        {
          key: t.key,
          updatedAt: t.deletedAt,
          ownerHash,
          deleted: true,
        },
        ctx
      )
    ),
    ...settings.purgeRemote.map((key) => deleteDoc(doc(settingsCol, key))),
  ]);

  if (settings.pull.length > 0 || settings.deleteLocal.length > 0 || stamps.size > 0) {
    await db.transaction('rw', db.settings, async () => {
      const current = await readSettingsMeta();
      const untouched = (key: string) => current[key] === meta[key];
      const pull = settings.pull.filter((s) => untouched(s.key));
      const deleteLocal = settings.deleteLocal.filter(untouched);
      skipped =
        pull.length < settings.pull.length || deleteLocal.length < settings.deleteLocal.length;
      if (pull.length > 0 || deleteLocal.length > 0) {
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

  if (settings.clearLocalTombstones.length > 0) {
    const cleared = new Set(settings.clearLocalTombstones);
    await writeSettingsTombstones(settingsTombstones.filter((t) => !cleared.has(t.key)));
  }

  if (!skipped) {
    await writePullCursor(pull.cursorKey, pull.next);
    await db.settings.put({ key: settingsSeenSeqKey(ctx.characterId), value: seenSeq });
  }
}

async function readSeq(key: string): Promise<number> {
  const value = (await db.settings.get(key))?.value;
  return typeof value === 'number' ? value : 0;
}
