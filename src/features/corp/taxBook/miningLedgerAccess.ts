/**
 * Whether the active Character can read the refinery ledger, and if not,
 * whether the fix is one scope away (issue #4062/#4058).
 *
 * `canReadMiningLedger` is an additive corp capability (`corpScopes.ts`): an
 * Accountant who granted the corp scopes before `read_corporation_mining` was
 * added stays `ready` for the wallet but has this capability off. Nothing
 * asked them for the scope, because the corp grant prompt shows once and its
 * wording assumes no corp access at all. The first screen that reads the
 * ledger asks, and this is what it branches on: `needs-scope` shows the
 * prompt, `request` takes the Character to SSO.
 */
import { useCallback } from 'react';
import { beginEveLogin } from '@/app/loginFlow';
import { corpCapabilities } from '@/engine/corpRoles';
import type { Scope } from '@/esi/registry';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { CORP_SCOPES_FOR_CAPABILITY } from '../corpScopes';
import { useCorpAccess, type CorpAccess } from '../useCorpAccess';

export type MiningLedgerAccess =
  /** Corp access has not resolved yet; show nothing. */
  | { state: 'unknown' }
  /** This Character's roles cannot read the ledger (not an Accountant, or no corp grant at all). */
  | { state: 'unavailable' }
  /** An Accountant who has not granted the mining scope; offer it. */
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
  // A known Character, so the request unions with its existing grant (app/loginFlow.ts).
  const request = useCallback(async () => {
    if (characterId === null) return;
    await beginEveLogin({ characterId, groups: ['corp'] });
  }, [characterId]);
  return { ...resolved, request };
}
