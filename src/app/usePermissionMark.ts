import { useLiveQuery } from 'dexie-react-hooks';
import type { PermissionCellMarkStatus } from '@/components/ui/PermissionCellMark';
import { db } from '@/db';
import type { EsiEndpointId, ScopeGroup } from '@/esi/registry';
import { isPermissionGranted } from '@/esi/scopes';
import {
  markStatus,
  usePermissionMarkDismissals,
} from '@/features/permissions/permissionMarkDismissals';
import { loadGrantedScopes } from './grantedScopes';
import { missingPermissions } from './missingPermissions';

export type PermissionNeed =
  | { endpoints: readonly EsiEndpointId[]; permission?: never }
  | { permission: ScopeGroup; endpoints?: never };

export interface PermissionMarkState {
  status: PermissionCellMarkStatus;
  asking: readonly ScopeGroup[];
  storedName: string | undefined;
}

export function usePermissionMark(
  characterId: number | null,
  need: PermissionNeed
): PermissionMarkState | undefined {
  const { dismissed, hydrated } = usePermissionMarkDismissals();
  const needKey = need.permission ?? need.endpoints.join(',');
  const read = useLiveQuery(async () => {
    if (characterId === null) return undefined;
    const [character, scopes] = await Promise.all([
      db.characters.get(characterId),
      loadGrantedScopes(characterId),
    ]);
    const missing: ScopeGroup[] = need.permission
      ? isPermissionGranted(need.permission, [...scopes])
        ? []
        : [need.permission]
      : missingPermissions(need.endpoints, [...scopes]);
    return { characterId, name: character?.name, missing };
  }, [characterId, needKey]);
  if (!hydrated || read === undefined || read.characterId !== characterId) return undefined;
  return { ...markStatus(read.missing, dismissed), storedName: read.name };
}
