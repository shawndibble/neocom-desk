/**
 * The Contracts page's 2-tab strip (issue #908). Mirrors
 * `features/industry/industryTabs.ts` — same `?tab=`-driven shape, so the two
 * tabbed pages in the app answer a hand-edited or stale link the same way.
 *
 * History is the character's own contracts (everything the page was before
 * this ticket); Search is the public item_exchange/auction corpus, which is
 * not this character's data at all.
 */
import type { TFunction } from 'i18next';

export type ContractsTab = 'history' | 'search';

/** An unknown or absent `?tab=` falls back to History rather than rendering nothing — the page's original content is the safe landing. */
export function readContractsTab(value: string | null): ContractsTab {
  return value === 'search' ? 'search' : 'history';
}

export function contractsTabs(t: TFunction): { id: ContractsTab; label: string }[] {
  return [
    { id: 'history', label: t('contracts.historyTab') },
    { id: 'search', label: t('contracts.searchTab') },
  ];
}
