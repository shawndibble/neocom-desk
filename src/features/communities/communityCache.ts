/**
 * The last Community data read while online, kept on this device so the
 * Communities page can still show it with no connection (read-only, labelled
 * cached). Firestore here is the `lite` build with no offline persistence, so
 * without this an offline visit shows nothing and every Community is out of
 * reach.
 *
 * Stored in `settings` under `communitySnapshot:{characterId}:{kind}[:{communityId}]`,
 * like the other small per-Character Community records (`shareSelection.ts`,
 * `requestBadge.ts`): no new table. A Community and its Members are already
 * visible to this Character, so the snapshot holds nothing it could not read
 * live; the prefix is per Character, so another Character never sees it, and
 * `deleteCommunitySnapshots` runs wherever the Character's rows are removed
 * (`removeCharacter`).
 */
import { db } from '@/db';

export type SnapshotKind = 'list' | 'members' | 'libraries';

const PREFIX = 'communitySnapshot:';
const keyFor = (characterId: number, kind: SnapshotKind, communityId?: string) =>
  `${PREFIX}${characterId}:${kind}${communityId === undefined ? '' : `:${communityId}`}`;

/** Remember what was just read. A write that fails (quota, private window) is dropped: this is only a fallback. */
export async function saveCommunitySnapshot(
  characterId: number,
  kind: SnapshotKind,
  value: unknown,
  communityId?: string
): Promise<void> {
  try {
    await db.settings.put({ key: keyFor(characterId, kind, communityId), value });
  } catch (err) {
    console.warn('Community snapshot could not be saved', err);
  }
}

/** The last saved copy, or null when there is none (or it cannot be read). */
export async function loadCommunitySnapshot<T>(
  characterId: number,
  kind: SnapshotKind,
  communityId?: string
): Promise<T | null> {
  try {
    const row = await db.settings.get(keyFor(characterId, kind, communityId));
    return row ? (row.value as T) : null;
  } catch {
    return null;
  }
}

/** Run inside `removeCharacter`'s transaction: a removed Character leaves no Community data behind. */
export async function deleteCommunitySnapshots(characterId: number): Promise<void> {
  await db.settings.where('key').startsWith(`${PREFIX}${characterId}:`).delete();
}
