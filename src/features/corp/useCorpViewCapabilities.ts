import { useMemo } from 'react';
import type { CorpCapabilities } from '@/engine/corpRoles';
import { miningLedgerAccess } from './taxBook/miningLedgerAccess';
import { useCorpAccess } from './useCorpAccess';

/**
 * The capabilities the Corp sub-nav is built from. Moons (`/corp/moons`) is
 * offered to every Character whose roles can read the refinery ledger, even
 * before they have granted its additive scope: the page itself asks for it
 * (issue #4058), so gating the entry on the granted capability would hide the
 * only place that can ask. Every other entry is `useCorpAccess().capabilities`.
 */
export function useCorpViewCapabilities(): CorpCapabilities {
  const access = useCorpAccess();
  return useMemo(() => {
    const ledger = miningLedgerAccess(access).state;
    return {
      ...access.capabilities,
      canReadMiningLedger: ledger === 'ready' || ledger === 'needs-scope',
    };
  }, [access]);
}
