import { createContext } from 'react';

/**
 * True inside a `FilterBar`'s `search` slot: the `SearchInput` there is the
 * page's own search box, the one the `/` shortcut focuses
 * (`lib/pageSearch.ts`) and the one that shows the `/` hint.
 *
 * Its own module rather than `FilterBar.tsx` so that file exports components
 * only, which is what keeps Fast Refresh working for it.
 */
export const PrimarySearchContext = createContext(false);
