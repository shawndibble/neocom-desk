import type { ReactNode } from 'react';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { AccountCorporationsContext, NO_CORPORATIONS } from './accountCorporationsContext';
import { loadAccountCorporations } from './loadAccountCorporations';

/** One read for the Corp Board, not one per widget. */
export function AccountCorporationsProvider({ children }: { children: ReactNode }) {
  const corporations = useAsyncLoad(loadAccountCorporations).data ?? NO_CORPORATIONS;
  return (
    <AccountCorporationsContext.Provider value={corporations}>
      {children}
    </AccountCorporationsContext.Provider>
  );
}
