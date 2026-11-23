/** ESI's `X-Compatibility-Date`. Its own module so the service worker can send it without the ESI client. */
// 2026-08-04: the Military Campaigns routes only exist from this date on (404 below it).
// ESI's changelog lists nothing else between 2026-08-01 and 2026-08-04.
export const COMPATIBILITY_DATE = '2026-08-04';
