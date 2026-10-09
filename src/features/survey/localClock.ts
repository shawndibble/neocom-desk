/**
 * A moment on the viewer's own clock, the way their browser writes a time of
 * day: "12:44 AM CST" where the locale reads 12-hour, "00:44 CET" where it
 * reads 24-hour, always with the zone's short name. Never "local": the zone
 * name says which clock it is. The locale is the browser's own (not the app's
 * language, which is `en` for everyone) so a 24-hour machine isn't forced to 12.
 */
export function formatLocalClock(at: number, locale?: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  }).format(at);
}
