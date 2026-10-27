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
