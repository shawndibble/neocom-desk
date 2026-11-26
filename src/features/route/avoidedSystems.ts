import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const AVOIDED_SYSTEMS_KEY = 'sync.avoidedSystems';

export function parseAvoidedSystems(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  return [
    ...new Set(
      raw.filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0)
    ),
  ];
}

export function addAvoidedSystem(avoided: number[], systemId: number): number[] {
  return avoided.includes(systemId) ? avoided : [...avoided, systemId];
}

export function removeAvoidedSystem(avoided: readonly number[], systemId: number): number[] {
  return avoided.filter((id) => id !== systemId);
}

export const useAvoidedSystems = createSyncedSetting<number[]>({
  key: AVOIDED_SYSTEMS_KEY,
  defaultValue: [],
  parse: parseAvoidedSystems,
});
