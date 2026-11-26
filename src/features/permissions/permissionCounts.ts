import { PERMISSIONS, SCOPE_GROUPS } from '@/esi/registry';
import { isPermissionGranted } from '@/esi/scopes';

export interface PermissionCount {
  granted: number;
  total: number;
}

export interface CharacterPermissionCount extends PermissionCount {
  characterId: number;
  name: string;
}

export const COUNTED_PERMISSIONS = SCOPE_GROUPS.filter(
  (group) =>
    group !== 'corp' && group !== 'militaryCampaigns' && PERMISSIONS[group].section !== 'write'
);

export function countGrantedPermissions(scopes: readonly string[]): PermissionCount {
  return {
    granted: COUNTED_PERMISSIONS.filter((group) => isPermissionGranted(group, scopes)).length,
    total: COUNTED_PERMISSIONS.length,
  };
}

export function pickerTone({ granted, total }: PermissionCount): 'success' | 'warning' | 'danger' {
  if (granted >= total) return 'success';
  return granted * 2 < total ? 'danger' : 'warning';
}

export function orderForPicker<T extends CharacterPermissionCount>(
  rows: readonly T[]
): { needs: T[]; complete: T[] } {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  return {
    needs: rows
      .filter((row) => row.granted < row.total)
      .sort((a, b) => a.granted - b.granted || byName(a, b)),
    complete: rows.filter((row) => row.granted >= row.total).sort(byName),
  };
}
