/**
 * The `?highlight=` query key (`useHighlightParam.ts`). Lives beside the hook,
 * not the route table, because both the link that writes it and the table that
 * reads it point here, and a second spelling would break the pair silently.
 *
 * Its own React-free module because the service worker writes it too
 * (`notificationOptions.ts`), and importing the hook's file would bundle React
 * and React Router into `sw.mjs` for one string.
 */
export const HIGHLIGHT_PARAM = 'highlight';

/**
 * The `?open=` query key (`useOpenParam.ts`): the sibling of `?highlight=` that
 * also opens the row's modal. Same React-free module for the same reason.
 */
export const OPEN_PARAM = 'open';

/** `path?open=<id>` (`&` after an existing query), the link a widget row builds to open a record's modal on its page. */
export function openHref(path: string, id: number | string): string {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}${OPEN_PARAM}=${encodeURIComponent(String(id))}`;
}
