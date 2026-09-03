/**
 * Device-local persistence of each polled domain's last snapshot per character
 * (AC6, issue #172) — the "old state" half of the diff functions in
 * `engine/notificationDiffs.ts`. Never synced: it exists purely so a reload
 * doesn't lose the baseline and re-fire a notification for a change the poller
 * already reported.
 *
 * One store factory and one merge, shared by every entry in `pollDomains.ts`
 * (issue #273). A ninth polled domain is a registry entry, not another copy of
 * a guard, a `createLocalSetting` call and a `withCharacter*Snapshot` helper.
 */
import { createLocalSetting, type LocalSettingStore } from '@/lib/useLocalSetting';

/** Every polled domain persists the same shape: one snapshot per character id. */
export type PollerState<TSnapshot> = Record<number, TSnapshot>;

/** The default for every domain store: nobody has a baseline yet. */
export const EMPTY_POLLER_STATE: PollerState<never> = {};

/**
 * Builds the snapshot guard a domain store parses with. Every snapshot in
 * `engine/notificationDiffs.ts` is `{ nowMs, <entriesKey>: TEntry[] }` — only
 * the array's name (`entries`, or `colonies` for planetary interaction) and
 * its element guard differ, so those are all a domain has to supply.
 */
export function isSnapshotWith<TSnapshot>(
  entriesKey: string,
  isEntry: (raw: unknown) => boolean
): (raw: unknown) => raw is TSnapshot {
  return (raw): raw is TSnapshot => {
    if (typeof raw !== 'object' || raw === null) return false;
    const record = raw as Record<string, unknown>;
    const entries = record[entriesKey];
    return typeof record.nowMs === 'number' && Array.isArray(entries) && entries.every(isEntry);
  };
}

/** A stored state is a character-id-keyed map of snapshots this domain still recognises. */
function isPollerState<TSnapshot>(
  raw: unknown,
  isSnapshot: (value: unknown) => value is TSnapshot
): raw is PollerState<TSnapshot> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Object.entries(raw as Record<string, unknown>).every(
    ([key, value]) => !Number.isNaN(Number(key)) && isSnapshot(value)
  );
}

/**
 * One `createLocalSetting` store for one polled domain. Called once per key at
 * module scope from `pollDomains.ts`, which is where `createLocalSetting`
 * requires it to happen.
 */
export function createPollerStateStore<TSnapshot>(
  key: string,
  isSnapshot: (raw: unknown) => raw is TSnapshot
): LocalSettingStore<PollerState<TSnapshot>> {
  return createLocalSetting<PollerState<TSnapshot>>({
    key,
    defaultValue: {},
    parse: (raw) => (isPollerState(raw, isSnapshot) ? raw : null),
  });
}

/** Sets one character's snapshot without disturbing the others. */
export function withCharacterSnapshot<TSnapshot>(
  state: PollerState<TSnapshot>,
  characterId: number,
  snapshot: TSnapshot
): PollerState<TSnapshot> {
  return { ...state, [characterId]: snapshot };
}
