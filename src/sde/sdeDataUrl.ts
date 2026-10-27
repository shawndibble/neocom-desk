/**
 * Where a `public/data/**` SDE file is fetched from: its plain path plus
 * `?v=<content hash>`, the hash computed from the file's bytes at build time
 * (`vite.config.ts`'s `__SDE_DATA_VERSIONS__`). GitHub Pages gives these
 * files no cache lifetime worth having and a new ETag on every deploy, so the
 * service worker (`src/sw.ts`) caches the files it doesn't precache
 * cache-first under this versioned URL — a file whose bytes changed is a new
 * URL, and one that didn't stays a cache hit across any number of deploys.
 *
 * A file missing from the map (a dev server started before a new file
 * landed) gets its plain URL, which the service worker's versioned-data
 * route doesn't match and so never caches forever.
 */
export function sdeDataUrl(
  baseUrl: string,
  file: string,
  versions: Readonly<Record<string, string>> = __SDE_DATA_VERSIONS__
): string {
  const url = `${baseUrl}data/${file}`;
  const version = versions[file];
  return version ? `${url}?v=${version}` : url;
}
