/**
 * Marks the search box `/` focuses: the one in a page's `FilterBar` row, set
 * by `SearchInput` when it sits in that row's `search` slot.
 */
export const PRIMARY_SEARCH_ATTRIBUTE = 'data-primary-search';

function isShown(element: HTMLInputElement): boolean {
  if (element.disabled || element.closest('[inert], [hidden]')) return false;
  // jsdom has no layout, and no `checkVisibility` to ask about it.
  return typeof element.checkVisibility === 'function' ? element.checkVisibility() : true;
}

/**
 * Put the cursor in the page's search box, with its text selected so typing
 * replaces the last query — the `/` shortcut. The `FilterBar` one wins; a
 * page without one gets its first visible search box. Only boxes in the
 * page content (`<main>`) count, not one in the sidebar.
 *
 * @returns whether there was a box to focus, so the key can be left to the
 *   browser (Firefox's quick find) on a page with none.
 */
export function focusPageSearch(root: ParentNode = document): boolean {
  const main = root.querySelector('main');
  if (!main) return false;
  const candidates = [
    ...main.querySelectorAll<HTMLInputElement>(`input[${PRIMARY_SEARCH_ATTRIBUTE}]`),
    ...main.querySelectorAll<HTMLInputElement>('input[type="search"]'),
  ];
  const target = candidates.find(isShown);
  if (!target) return false;
  target.focus();
  target.select();
  return true;
}
