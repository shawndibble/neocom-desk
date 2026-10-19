import { useMemo } from 'react';
import { canViewCorpTaxBook, type CorpCapabilities } from '@/engine/corpRoles';
import { miningLedgerAccess } from './taxBook/miningLedgerAccess';
import { useCorpAccess } from './useCorpAccess';

/**
 * The capabilities the Corp sub-nav is built from. Moons (`/corp/moons`) is
 * offered to every Character whose roles can view the Corp Tax Book (D8), or
 * read the refinery ledger, even
 * before they have granted its additive scope: the page itself asks for it
 * (issue #4058), so gating the entry on the granted capability would hide the
 * only place that can ask. Every other entry is `useCorpAccess().capabilities`.
 */
export function useCorpViewCapabilities(): CorpCapabilities {
  const { state, roles, capabilities } = useCorpAccess();
  // Keyed on the parts, not the access object, so the result is stable across renders.
  return useMemo(() => {
    const ledger = miningLedgerAccess({ state, roles, capabilities }).state;
    return {
      ...capabilities,
      canReadMiningLedger:
        ledger === 'ready' ||
        ledger === 'needs-scope' ||
        // Viewing the book is wider than syncing it (D8): a Junior_Accountant opens it too.
        (state === 'ready' && canViewCorpTaxBook(roles)),
    };
  }, [state, roles, capabilities]);
}
