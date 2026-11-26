import { useStorageAtRisk } from '@/features/settings/storageAtRisk';
import { useUpdateStatus } from './updateAvailable';

export function useSettingsNeedsAttention(): boolean {
  const updateAvailable = useUpdateStatus((state) => state.status === 'available');
  const storageAtRisk = useRailSettingsNeedsAttention();
  return updateAvailable || storageAtRisk;
}

export function useRailSettingsNeedsAttention(): boolean {
  return useStorageAtRisk((state) => state.atRisk);
}
