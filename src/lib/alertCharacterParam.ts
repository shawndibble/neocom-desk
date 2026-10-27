/**
 * The `?character=` query key an alert's link carries: the Character the alert
 * was about. `AlertCharacterSwitch` reads it on arrival.
 *
 * React-free for the same reason as `highlightParam.ts` — the service worker
 * writes it into `data.url` (`notificationOptions.ts`).
 */
export const ALERT_CHARACTER_PARAM = 'character';
