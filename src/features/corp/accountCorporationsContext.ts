import { createContext, useContext } from 'react';
import type { CorpLabel } from './corpTicker';

export interface AccountCorporation {
  id: number;
  label: CorpLabel;
}

const NONE: readonly AccountCorporation[] = [];

export const AccountCorporationsContext = createContext<readonly AccountCorporation[]>(NONE);

export const NO_CORPORATIONS = NONE;

export function useAccountCorporations(): readonly AccountCorporation[] {
  return useContext(AccountCorporationsContext);
}
