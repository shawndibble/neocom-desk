import { db } from '@/db';
import { createSettingStore, type SettingStore } from './settingStore';

const SYNCED_PREFIX = 'sync.';

export interface LocalSettingOptions<T> {
  key: string;
  defaultValue: T;
  parse?: (raw: unknown) => T | null;
  onApply?: (value: T) => void;
}

export type LocalSettingStore<T> = SettingStore<T>;

export function settingCoercer<T>(
  defaultValue: T,
  parse?: (raw: unknown) => T | null
): (raw: unknown) => T {
  return (raw) => {
    const parsed = parse ? parse(raw) : typeof raw === typeof defaultValue ? (raw as T) : null;
    return parsed ?? defaultValue;
  };
}

export function createLocalSetting<T>(options: LocalSettingOptions<T>): LocalSettingStore<T> {
  const { key, defaultValue, parse, onApply } = options;

  if (key.startsWith(SYNCED_PREFIX)) {
    throw new Error(
      `Local settings keys must not start with '${SYNCED_PREFIX}' — that prefix syncs (got '${key}')`
    );
  }

  return createSettingStore<T>({
    defaultValue,
    onApply,
    coerce: settingCoercer(defaultValue, parse),
    read: () => db.settings.get(key),
    write: async (value) => {
      await db.settings.put({ key, value });
    },
  });
}
