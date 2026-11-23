/**
 * The player corporations the pilot's Characters belong to and can have corp reads through,
 * named: what the Corp Board's scope control and each widget's menu list as corporations.
 *
 * One read for the board (`AccountCorporationsProvider`), not one per widget. Outside a
 * provider (a test, the Overview) the list is empty, so no corporation is offered.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { isNpcCorporationId } from '@/esi/entityIds';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { loadAccountCorpAccess } from './corpReadAccess';
import { loadCorpLabels, type CorpLabel } from './corpTicker';

export interface AccountCorporation {
  id: number;
  label: CorpLabel;
}

/** Every player corporation some stored Character's corp gate settled for, in account order. */
// eslint-disable-next-line react-refresh/only-export-components
export async function loadAccountCorporations(): Promise<AccountCorporation[]> {
  const accounts = await loadAccountCorpAccess();
  const ids = [...new Set(accounts.map(({ access }) => access.corporationId))].filter(
    (id) => !isNpcCorporationId(id)
  );
  const labels = await loadCorpLabels(ids);
  return ids.map((id) => ({
    id,
    label: labels.get(id) ?? { ticker: String(id), name: String(id) },
  }));
}

const NONE: readonly AccountCorporation[] = [];
const AccountCorporationsContext = createContext<readonly AccountCorporation[]>(NONE);

export function AccountCorporationsProvider({ children }: { children: ReactNode }) {
  const corporations = useAsyncLoad(loadAccountCorporations).data ?? NONE;
  return (
    <AccountCorporationsContext.Provider value={corporations}>
      {children}
    </AccountCorporationsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAccountCorporations(): readonly AccountCorporation[] {
  return useContext(AccountCorporationsContext);
}
