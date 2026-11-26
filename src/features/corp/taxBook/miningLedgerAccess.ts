import { useCallback } from 'react';
import { beginEveLogin } from '@/app/loginFlow';
import { corpCapabilities } from '@/engine/corpRoles';
import type { Scope } from '@/esi/registry';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { CORP_SCOPES_FOR_CAPABILITY } from '../corpScopes';
import { useCorpAccess, type CorpAccess } from '../useCorpAccess';

export type MiningLedgerAccess =
  | { state: 'unknown' }
  | { state: 'unavailable' }
  | { state: 'needs-scope'; scopes: readonly Scope[] }
  | { state: 'ready' };

export function miningLedgerAccess(
  access: Pick<CorpAccess, 'state' | 'roles' | 'capabilities'>
): MiningLedgerAccess {
  if (access.state === 'unknown') return { state: 'unknown' };
  if (access.state !== 'ready') return { state: 'unavailable' };
  if (!corpCapabilities(access.roles).canReadMiningLedger) return { state: 'unavailable' };
  if (access.capabilities.canReadMiningLedger) return { state: 'ready' };
  return { state: 'needs-scope', scopes: CORP_SCOPES_FOR_CAPABILITY.canReadMiningLedger };
}

export function useMiningLedgerAccess(): MiningLedgerAccess & { request: () => Promise<void> } {
  const access = useCorpAccess();
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const resolved = miningLedgerAccess(access);
  const request = useCallback(async () => {
    if (characterId === null) return;
    await beginEveLogin({ characterId, groups: ['corp'] });
  }, [characterId]);
  return { ...resolved, request };
}
