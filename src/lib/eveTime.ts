/**
 * EVE time is UTC — the clock every player, timer and killmail in New Eden
 * runs on. A job's end shown in the viewer's own zone would be the one number
 * on the page they cannot read back to the game client.
 */

/** An instant as EVE time, `MM-DD HH:MM`. */
export function formatEveDateTime(date: Date): string {
  // Sliced off the ISO string rather than formatted: `Intl` would resolve
  // month names and the hour cycle per host, and this needs neither.
  return date.toISOString().slice(5, 16).replace('T', ' ');
}
