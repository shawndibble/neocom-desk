import { useMemo } from 'react';
import { canViewCorpTaxBook, type CorpCapabilities } from '@/engine/corpRoles';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { corporationsReading, loadAccountCorpAccess } from './corpReadAccess';
import { miningLedgerAccess } from './taxBook/miningLedgerAccess';
import { useCorpAccess } from './useCorpAccess';

export function useCorpViewCapabilities(): CorpCapabilities {
  const { state, roles, capabilities } = useCorpAccess();
  const accounts = useAsyncLoad(loadAccountCorpAccess).data;
  const anyReadsStructures =
    accounts !== undefined && corporationsReading(accounts, ['canReadStructures']) > 0;
  return useMemo(() => {
    const ledger = miningLedgerAccess({ state, roles, capabilities }).state;
    return {
      ...capabilities,
      canReadStructures: capabilities.canReadStructures || anyReadsStructures,
      canReadMiningLedger:
        ledger === 'ready' ||
        ledger === 'needs-scope' ||
        (state === 'ready' && canViewCorpTaxBook(roles)),
    };
  }, [state, roles, capabilities, anyReadsStructures]);
}
