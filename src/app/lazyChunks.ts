/**
 * Which build chunks the service worker precaches at install, and which it
 * leaves to the idle warm and a cache-first runtime route (`sw.ts`).
 *
 * Only the boot graph is precached: the entry's static imports (what
 * `index.html` modulepreloads), the css they pull in, and the signed-in shell
 * that boot preloads. Every other hashed chunk is a route a pilot may never
 * open; precaching them made every install download most of the app whatever
 * the connection. Chunks import each other through an import map
 * (`chunkImportMapping`), so a deploy renames only the chunks whose own code
 * changed.
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
  /** A chunk's code; an asset's content (`importmap.json`). */
  code?: string;
  source?: string | Uint8Array;
}
export type BundleLike = Record<string, BundleItemLike>;

/**
 * Chunks boot starts by dynamic import (`bootShellPreload.ts` →
 * `preloadSignedInShell`), so they are not in `index.html`'s preload list yet
 * a returning pilot needs them on the first frame, offline included.
 */
const SHELL_CHUNK_NAMES = new Set(['Layout', 'Overview']);

/** The entry chunk's file name: what identifies a build (its hash changes with every deploy). */
export function entryFile(bundle: BundleLike): string {
  const entry = Object.values(bundle).find((item) => item.type === 'chunk' && item.isEntry);
  if (!entry) throw new Error('entryFile: the bundle has no entry chunk');
  return entry.fileName;
}

/**
 * The shell chunks the bundle no longer has under their expected `name`
 * (a rename, or a name collision like `Overview2`, would quietly drop them from
 * the boot graph). The build fails on a non-empty result.
 */
export function missingShellChunks(bundle: BundleLike): string[] {
  const names = new Set(Object.values(bundle).map((item) => item.name));
  return [...SHELL_CHUNK_NAMES].filter((name) => !names.has(name));
}

/**
 * Rolldown's chunk import map (`build.chunkImportMap`) as stable name → hashed
 * file, both under the base (`assets/x-STABLE.js` → `assets/x-HASH.js`). A chunk
 * imports its neighbours by the stable name, so its own hash no longer changes
 * when theirs do. Empty when the bundle has none.
 */
export function chunkImportMapping(bundle: BundleLike, base: string): Record<string, string> {
  const source = bundle['importmap.json']?.source;
  if (source === undefined) return {};
  const text = typeof source === 'string' ? source : new TextDecoder().decode(source);
  const { imports } = JSON.parse(text) as { imports: Record<string, string> };
  return Object.fromEntries(
    Object.entries(imports).map(([key, file]) => [key.slice(base.length), file.slice(base.length)])
  );
}

/**
 * Whether the entry chunk's code carries the release. With the import map a
 * chunk's hash follows its own code only, and `lazy-chunks.json`'s `entry`
 * (`listMatchesBuild`) must still name exactly one build: `instrument.ts`
 * hands Sentry the release from the entry, so the entry changes every deploy.
 */
export function entryNamesRelease(bundle: BundleLike, release: string): boolean {
  const entry = bundle[entryFile(bundle)];
  return entry.code?.includes(release) ?? false;
}

/**
 * Every file the app needs to boot: static imports (and their css) of the entry
 * and the shell chunks. An import may name the chunk by its import-map key
 * (`chunkImportMapping`); one that names no file throws, since a boot chunk
 * missing here would quietly drop out of the precache.
 */
export function bootClosure(
  bundle: BundleLike,
  importMap: Readonly<Record<string, string>> = {}
): Set<string> {
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
    for (const css of item.viteMetadata?.importedCss ?? []) boot.add(css);
    for (const imported of item.imports ?? []) {
      const file = importMap[imported] ?? imported;
      if (!bundle[file])
        throw new Error(`bootClosure: ${fileName} imports ${imported}, no such file`);
      visit(file);
    }
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

/** `lazy-chunks.json`: what the warm, the Offline panel and the worker's cleanup read. `entry` names the build it belongs to. */
export function lazyChunksJson(files: readonly string[], release: string, entry: string): string {
  return JSON.stringify({ release, entry, files });
}

/**
 * Whether a `lazy-chunks.json` body belongs to the build this worker precached
 * (its entry file is in the worker's precache manifest). The file is read live,
 * so a worker for build N activating after N+1 deployed would otherwise prune
 * the chunks the page, still on N, is about to ask for.
 */
export function listMatchesBuild(body: unknown, precachedUrls: readonly string[]): boolean {
  const entry = (body as { entry?: unknown } | null)?.entry;
  return typeof entry === 'string' && precachedUrls.includes(entry);
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

/** The file names in a `lazy-chunks.json` body, or `[]` when it is not one (an HTML fallback page, a bad shape). */
export function parseLazyChunksJson(body: unknown): string[] {
  const files = (body as { files?: unknown } | null)?.files;
  return Array.isArray(files)
    ? files.filter((file): file is string => typeof file === 'string')
    : [];
}

/** The slice of a Rolldown `RenderedChunk` (`renderChunk`'s `meta.chunks`) `preloadGraphSignature` reads. */
export interface RenderedChunkLike {
  name: string;
  moduleIds: readonly string[];
  imports: readonly string[];
  dynamicImports: readonly string[];
}

/**
 * What a chunk's preload lists will name, as a string for `augmentChunkHash`.
 * Vite writes each `import()`'s preload list (`__vite__mapDeps`: the target and
 * everything it statically imports, css included) after the hash is fixed. With
 * the import map a chunk's hash covers only its own code, so a chunk whose list
 * changed kept its name with new bytes, and the precache (`revision: null`) and
 * the `lazy-chunks` route kept the old bytes for good. Signing each chunk the
 * import pulls in by name and modules (never the preliminary file name, whose
 * placeholders are positional) renames it exactly when its lists can change.
 * Empty without a dynamic import.
 */
export function preloadGraphSignature(
  fileName: string,
  chunks: Readonly<Record<string, RenderedChunkLike>>
): string {
  const get = (file: string) => {
    const chunk = chunks[file];
    if (!chunk)
      throw new Error(`preloadGraphSignature: ${fileName} reaches ${file}, not in the graph`);
    return chunk;
  };
  const identity = (chunk: RenderedChunkLike) =>
    `${chunk.name}(${[...chunk.moduleIds].sort().join(',')})`;
  const closure = (file: string) => {
    const seen = new Set<string>();
    const visit = (f: string) => {
      if (seen.has(f)) return;
      seen.add(f);
      for (const imported of get(f).imports) visit(imported);
    };
    visit(file);
    return [...seen].map((f) => identity(get(f))).sort();
  };
  return get(fileName)
    .dynamicImports.map((target) => `${identity(get(target))}>${closure(target).join(';')}`)
    .sort()
    .join('\n');
}
