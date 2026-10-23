/**
 * Which build chunks the service worker precaches at install, and which it
 * leaves to the idle warm and a cache-first runtime route (`sw.ts`).
 *
 * Only the boot graph is precached: the entry's static imports (what
 * `index.html` modulepreloads), the css they pull in, and the signed-in shell
 * that boot preloads. Every other hashed chunk is a route a pilot may never
 * open, and each deploy rewrites hundreds of them (a changed leaf rewrites the
 * hashed filename inside every importer), so precaching them made every
 * install re-download most of the app whatever the connection.
 *
 * Pure and import-free: `vite.config.ts` loads this file at config time, and
 * `sw.ts` uses `chunkKey`/`chunksToDelete`.
 */

/** The slice of a Rollup/Rolldown output item this module reads. */
export interface BundleItemLike {
  type: 'chunk' | 'asset';
  fileName: string;
  name?: string;
  isEntry?: boolean;
  imports?: string[];
  viteMetadata?: { importedCss?: Set<string> };
}
export type BundleLike = Record<string, BundleItemLike>;

/**
 * Chunks boot starts by dynamic import (`bootShellPreload.ts` →
 * `preloadSignedInShell`), so they are not in `index.html`'s preload list yet
 * a returning pilot needs them on the first frame, offline included.
 */
const SHELL_CHUNK_NAMES = new Set(['Layout', 'Overview']);

/** Every file the app needs to boot: static imports (and their css) of the entry and the shell chunks. */
export function bootClosure(bundle: BundleLike): Set<string> {
  const items = Object.values(bundle);
  const roots = items.filter(
    (item) =>
      item.type === 'chunk' && (item.isEntry || (item.name && SHELL_CHUNK_NAMES.has(item.name)))
  );
  if (!roots.some((item) => item.isEntry))
    throw new Error('bootClosure: the bundle has no entry chunk');

  const boot = new Set<string>();
  const visit = (fileName: string) => {
    if (boot.has(fileName)) return;
    boot.add(fileName);
    const item = bundle[fileName];
    if (!item) return;
    for (const css of item.viteMetadata?.importedCss ?? []) boot.add(css);
    for (const imported of item.imports ?? []) visit(imported);
  };
  for (const root of roots) visit(root.fileName);
  return boot;
}

/** The hashed js and css under `assets/` that are not boot files, sorted: the lazy set. */
export function lazyChunkFiles(bundle: BundleLike, boot: ReadonlySet<string>): string[] {
  return Object.values(bundle)
    .map((item) => item.fileName)
    .filter((file) => file.startsWith('assets/') && /\.(js|css)$/.test(file) && !boot.has(file))
    .sort();
}

interface ManifestEntryLike {
  url: string;
}

/**
 * A Workbox `manifestTransforms` function that drops the lazy chunks from the
 * precache manifest and keeps everything else. An empty set would drop nothing
 * and quietly precache the whole app again, so it throws.
 */
export function dropLazyFromManifest(lazy: ReadonlySet<string>) {
  if (lazy.size === 0) throw new Error('dropLazyFromManifest: the lazy chunk list is empty');
  return async <T extends ManifestEntryLike>(entries: T[]) => ({
    manifest: entries.filter((entry) => !lazy.has(entry.url)),
    warnings: [] as string[],
  });
}

/** `lazy-chunks.json`: what the warm, the Offline panel and the worker's cleanup read. */
export function lazyChunksJson(files: readonly string[], release: string): string {
  return JSON.stringify({ release, files });
}

/** A request URL as the list names it: its path under the site base, query dropped. */
export function chunkKey(url: string, basePath: string): string {
  return new URL(url).pathname.slice(basePath.length);
}

/**
 * The cached chunks (as `chunkKey`s) the current build no longer lists. An
 * empty list means it could not be read, never "delete everything".
 */
export function chunksToDelete(cached: readonly string[], current: readonly string[]): string[] {
  if (current.length === 0) return [];
  const keep = new Set(current);
  return cached.filter((key) => !keep.has(key));
}
