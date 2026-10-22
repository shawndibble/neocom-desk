/**
 * How many Permissions a Character has granted, for the Character picker on
 * Settings › Permissions and the Character switcher. Pure: it takes a token's
 * scopes and nothing else, so no `TokenRecord` reaches feature code (ADR 0001).
 *
 * Corporation is left out of both numbers: it only matters to a Character with
 * a Corp Role, which is only knowable by asking ESI per Character (a roster of
 * twenty must not do that on every visit), and the panel hides its row without
 * one, so counting it showed a "missing" Permission nobody could see.
 */
import { SCOPE_GROUPS } from '@/esi/registry';
import { isPermissionGranted } from '@/esi/scopes';

export interface PermissionCount {
  granted: number;
  total: number;
}

export interface CharacterPermissionCount extends PermissionCount {
  characterId: number;
  name: string;
}

const COUNTED_GROUPS = SCOPE_GROUPS.filter((group) => group !== 'corp');

export function countGrantedPermissions(scopes: readonly string[]): PermissionCount {
  return {
    granted: COUNTED_GROUPS.filter((group) => isPermissionGranted(group, scopes)).length,
    total: COUNTED_GROUPS.length,
  };
}

/** Complete is success; fewer than half is danger; the rest warning. */
export function pickerTone({ granted, total }: PermissionCount): 'success' | 'warning' | 'danger' {
  if (granted >= total) return 'success';
  return granted * 2 < total ? 'danger' : 'warning';
}

/** The picker's two groups: those that need Permissions (fewest granted first), then the complete ones, each by name. */
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
