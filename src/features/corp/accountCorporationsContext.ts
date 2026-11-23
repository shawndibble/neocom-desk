/**
 * The player corporations the pilot's Characters belong to, named: what the Corp Board's scope
 * control and each widget's menu list as corporations. Just the context and its hook, so the
 * widgets (in the startup graph) import no corp loader; `AccountCorporationsProvider` fills it.
 * Outside a provider (a test, the Overview) the list is empty, so no corporation is offered.
 */
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
