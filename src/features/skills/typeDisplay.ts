/** Display helpers for EVE "universe type" data (implants, items): icon URL + description markup. */

/** EVE image server icon URL for a type (CORS-safe for <img>). */
export function typeIconUrl(typeId: number, size: 32 | 64 | 128 = 64): string {
  return `https://images.evetech.net/types/${typeId}/icon?size=${size}`;
}

/**
 * ESI type descriptions carry EVE's own light markup (`<a href="showinfo:...">`,
 * `<b>`, `<color=...>`, `<font ...>`) rather than safe HTML. Strip all tags for
 * plain-text display; do not render the original string as HTML.
 */
export function stripEveMarkup(description: string): string {
  return description
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}
