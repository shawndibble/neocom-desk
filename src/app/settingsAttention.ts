import { useStorageAtRisk } from '@/features/settings/storageAtRisk';
import { useUpdateStatus } from './updateAvailable';

/**
 * Whether anything inside Settings has its own attention dot lit (DESIGN.md
 * §6c): an update waiting in App & backup, or the installed app's storage
 * unprotected in Offline data. The app's own Settings entry, and the phone's
 * More button that reaches it, carry the same dot so the pilot finds it
 * without opening Settings first.
 */
export function useSettingsNeedsAttention(): boolean {
  const updateAvailable = useUpdateStatus((state) => state.status === 'available');
  const storageAtRisk = useStorageAtRisk((state) => state.atRisk);
  return updateAvailable || storageAtRisk;
}

/**
 * The desktop rail's Settings dot: storage only. An update waiting has its own
 * upgrade icon beside the row (`RailUpgradeButton`), so it adds no dot here.
 */
export function useRailSettingsNeedsAttention(): boolean {
  return useStorageAtRisk((state) => state.atRisk);
}
