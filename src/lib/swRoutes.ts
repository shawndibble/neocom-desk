/**
 * Which requests `src/sw.ts`'s runtime-caching routes handle. Pure so they
 * can be unit-tested — `sw.ts` itself is wiring only (ADR 0007's carve-out).
 */

const EVE_IMAGE_ORIGIN = 'https://images.evetech.net';

/**
 * A same-origin SDE file under `<base>data/`, requested with its `?v=<content
 * hash>` (`src/sde/sdeDataUrl.ts`). The version is required: an unversioned
 * URL cached cache-first would never see an SDE update.
 */
export function isVersionedSdeData(
  url: URL,
  requestMode: RequestMode,
  selfOrigin: string,
  baseUrl: string
): boolean {
  return (
    requestMode !== 'navigate' &&
    url.origin === selfOrigin &&
    url.pathname.startsWith(`${baseUrl}data/`) &&
    url.searchParams.has('v')
  );
}

/** A type's icon, render or blueprint art on the EVE image server. */
export function isEveTypeImage(url: URL): boolean {
  return url.origin === EVE_IMAGE_ORIGIN && url.pathname.startsWith('/types/');
}

/** A character portrait or a corporation/alliance logo on the EVE image server. */
export function isEvePortraitImage(url: URL): boolean {
  return (
    url.origin === EVE_IMAGE_ORIGIN && /^\/(characters|corporations|alliances)\//.test(url.pathname)
  );
}
