// Its own module so `GrantCellMark.tsx` exports components only.
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

/** What the figure or control needs: its endpoints, or one Permission by id. */
export type PermissionNeed =
  | { endpoints: readonly EsiEndpointId[]; permission?: never }
  | { permission: ScopeGroup; endpoints?: never };

export interface PermissionMarkState {
  status: PermissionCellMarkStatus;
  /** The missing Permissions not dismissed: what the popover names, grants and dismisses. */
  asking: readonly ScopeGroup[];
  /** The Character's name as stored on this device, when the caller has none. */
  storedName: string | undefined;
}

/**
 * Where `characterId` stands on `need`, after the account-wide Don't ask
 * again: `granted`, `missing` or `dismissed`; `undefined` until both the grant
 * and the dismissals are read, so nothing flashes on a cold load. A caller
 * reads it to put fallback words in its own tooltip once `dismissed`. With no
 * Character (`null`) it stays `undefined`: the caller checks for that itself
 * and shows its no-Character wording. Only the
 * scope list leaves the token read (ADR 0001).
 */
export function usePermissionMark(
  characterId: number | null,
  need: PermissionNeed
): PermissionMarkState | undefined {
  const { dismissed, hydrated } = usePermissionMarkDismissals();
  // Keyed by value: callers may rebuild the array every render.
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
  // Checked against `characterId`: right after it changes the query still holds the previous answer.
  if (!hydrated || read === undefined || read.characterId !== characterId) return undefined;
  return { ...markStatus(read.missing, dismissed), storedName: read.name };
}
