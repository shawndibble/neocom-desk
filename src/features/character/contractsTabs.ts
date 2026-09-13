/**
 * The Contracts page's 2-tab strip (issue #908). Mirrors
 * `features/industry/industryTabs.ts` — same `?tab=`-driven shape, so the two
 * tabbed pages in the app answer a hand-edited or stale link the same way.
 *
 * Search is the public item_exchange/auction corpus; History is the
 * character's own contracts (everything the page was before #908).
 */
import type { TFunction } from 'i18next';

export type ContractsTab = 'search' | 'history';

/**
 * An unknown or absent `?tab=` falls back to Search rather than rendering
 * nothing. Search leads because it is the tab people open Contracts *to use* —
 * the public corpus is browsed constantly, while a character's own contract
 * history is a look-up-what-happened list. Only the exact string `history`
 * selects History, so every pre-existing `?tab=search` link still lands where
 * it always did.
 */
export function readContractsTab(value: string | null): ContractsTab {
  return value === 'history' ? 'history' : 'search';
}

export function contractsTabs(t: TFunction): { id: ContractsTab; label: string }[] {
  return [
    { id: 'search', label: t('contracts.searchTab') },
    { id: 'history', label: t('contracts.historyTab') },
  ];
}
