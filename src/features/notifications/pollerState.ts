import { createLocalSetting, type LocalSettingStore } from '@/lib/useLocalSetting';

export type PollerState<TSnapshot> = Record<number, TSnapshot>;

export const EMPTY_POLLER_STATE: PollerState<never> = {};

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

function isPollerState<TSnapshot>(
  raw: unknown,
  isSnapshot: (value: unknown) => value is TSnapshot
): raw is PollerState<TSnapshot> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Object.entries(raw as Record<string, unknown>).every(
    ([key, value]) => !Number.isNaN(Number(key)) && isSnapshot(value)
  );
}

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

export function withCharacterSnapshot<TSnapshot>(
  state: PollerState<TSnapshot>,
  characterId: number,
  snapshot: TSnapshot
): PollerState<TSnapshot> {
  return { ...state, [characterId]: snapshot };
}
