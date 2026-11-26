import { useCallback, useMemo } from 'react';
import {
  corpCapabilities,
  hasAnyCorpCapability,
  NO_CORP_CAPABILITIES,
  type CorpCapabilities,
} from '@/engine/corpRoles';
import type { Scope } from '@/esi/registry';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { corpWideRoles, loadCharacterRoles } from './roles';
import { corpGrantCoverage } from './corpScopes';
import { CORP_ROLES_SCOPE as ROLES_SCOPE } from './corpStanding';

export type CorpAccessState = 'unknown' | 'not-granted' | 'none' | 'roles-without-grant' | 'ready';

export interface CorpAccess {
  state: CorpAccessState;
  capabilities: CorpCapabilities;
  missingScopes: readonly Scope[];
  roles: readonly string[];
  readFailed: boolean;
  retry: () => void;
}

type ResolvedCorpAccess = Omit<CorpAccess, 'readFailed' | 'retry'>;

const UNKNOWN_CORP_ACCESS: ResolvedCorpAccess = {
  state: 'unknown',
  capabilities: NO_CORP_CAPABILITIES,
  missingScopes: [],
  roles: [],
};

const NO_CORP_ACCESS: ResolvedCorpAccess = { ...UNKNOWN_CORP_ACCESS, state: 'none' };
const NOT_GRANTED_CORP_ACCESS: ResolvedCorpAccess = {
  ...UNKNOWN_CORP_ACCESS,
  state: 'not-granted',
};

export function useCorpAccess(): CorpAccess {
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const granted = useGrantedScopes();
  const hasRolesScope = granted !== undefined && granted.includes(ROLES_SCOPE);
  const key =
    hydrated && activeCharacterId !== null && hasRolesScope ? `${activeCharacterId}` : null;
  const loader = useCallback(async (): Promise<readonly string[] | null> => {
    if (activeCharacterId === null) return null;
    const { cached, needsReauth } = await loadCharacterRoles(activeCharacterId);
    if (cached) return corpWideRoles(cached.data);
    if (needsReauth) return null;
    throw new Error('corp roles unavailable');
  }, [activeCharacterId]);
  const load = useKeyedLoad(key, loader);
  const readFailed = load.status === 'failed';
  const retry = load.retry;
  const roles = load.status === 'ready' ? load.data : null;

  const resolved = useMemo<ResolvedCorpAccess>(() => {
    if (granted === undefined) return UNKNOWN_CORP_ACCESS;
    if (!hasRolesScope) return NOT_GRANTED_CORP_ACCESS;
    if (roles === null) return UNKNOWN_CORP_ACCESS;

    const capabilities = corpCapabilities(roles);
    if (!hasAnyCorpCapability(capabilities)) return { ...NO_CORP_ACCESS, roles };

    const coverage = corpGrantCoverage(capabilities, granted);
    return {
      state: coverage.blocking ? 'roles-without-grant' : 'ready',
      capabilities: coverage.capabilities,
      missingScopes: coverage.missingScopes,
      roles,
    };
  }, [roles, granted, hasRolesScope]);

  return useMemo(
    () => ({ ...resolved, readFailed: resolved.state === 'unknown' && readFailed, retry }),
    [resolved, readFailed, retry]
  );
}
