/** Display helpers for EVE "universe type" data (implants, items): icon URL + description markup. */

/** EVE image server icon URL for a type (CORS-safe for <img>). */
export function typeIconUrl(typeId: number, size: 32 | 64 | 128 = 64): string {
  return `https://images.evetech.net/types/${typeId}/icon?size=${size}`;
}

/**
 * ESI type descriptions carry EVE's own light markup (`<a href="showinfo:...">`,
 * `<b>`, `<color=...>`, `<font ...>`) rather than safe HTML. Strip all tags for
 * plain-text display; do not render the original string as HTML.
 *
 * Order matters:
 *  - `<br>` variants convert to newlines *before* the generic tag strip runs
 *    (otherwise the line break is lost entirely, not just the tag).
 *  - Entities decode *after* tags are stripped, and `&lt;`/`&gt;` decode
 *    *before* `&amp;`. Decoding `&amp;` first can manufacture a `&lt;`/`&gt;`
 *    that wasn't in the original text (e.g. `&amp;lt;` -> `&lt;` -> `<`),
 *    silently turning literal escaped text into a tag-like character.
 *    Decoding `&lt;`/`&gt;` first, then `&amp;` last, ensures each entity in
 *    the raw string is decoded exactly once.
 */
export function stripEveMarkup(description: string): string {
  return description
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}
