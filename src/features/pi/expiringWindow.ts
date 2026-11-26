import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { HOUR_MS } from '@/lib/age';

export const PI_EXPIRING_WINDOW_SETTING_KEY = 'sync.piExpiringSoonHours';

export const LEGACY_PI_EXPIRING_WINDOW_SETTING_KEY = 'piExpiringSoonHours';

export const EXPIRING_WINDOW_HOUR_OPTIONS: readonly number[] = [1, 6, 12, 24];

export const DEFAULT_EXPIRING_WINDOW_HOURS = 24;

export const useExpiringWindowHours = createSyncedSetting<number>({
  key: PI_EXPIRING_WINDOW_SETTING_KEY,
  legacyKey: LEGACY_PI_EXPIRING_WINDOW_SETTING_KEY,
  defaultValue: DEFAULT_EXPIRING_WINDOW_HOURS,
  parse: (raw) =>
    typeof raw === 'number' && EXPIRING_WINDOW_HOUR_OPTIONS.includes(raw) ? raw : null,
});

export function useExpiringWindowMs(): number {
  return useExpiringWindowHours((state) => state.value) * HOUR_MS;
}
