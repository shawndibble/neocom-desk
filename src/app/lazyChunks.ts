export interface BundleItemLike {
  type: 'chunk' | 'asset';
  fileName: string;
  name?: string;
  isEntry?: boolean;
  imports?: string[];
  viteMetadata?: { importedCss?: Set<string> };
  code?: string;
  source?: string | Uint8Array;
}
export type BundleLike = Record<string, BundleItemLike>;

const SHELL_CHUNK_NAMES = new Set(['Layout', 'Overview']);

export function entryFile(bundle: BundleLike): string {
  const entry = Object.values(bundle).find((item) => item.type === 'chunk' && item.isEntry);
  if (!entry) throw new Error('entryFile: the bundle has no entry chunk');
  return entry.fileName;
}

export const SHELL_MODULE_SUFFIXES = ['/src/app/Layout.tsx', '/src/routes/Overview.tsx'];

export const PUBLIC_ROUTE_SUFFIXES = [
  '/src/routes/FittingShared.tsx',
  '/src/routes/SharedLink.tsx',
  '/src/routes/SurveyStart.tsx',
  '/src/routes/Apply.tsx',
  '/src/routes/CommunityJoin.tsx',
  '/src/routes/CorpTaxBookVerify.tsx',
  '/src/routes/CorpTaxBookRemoveNow.tsx',
  '/src/routes/ErrorProbe.tsx',
];

export interface ShellGraph {
  entries: readonly string[];
  shellRoots: readonly string[];
  publicRoots: readonly string[];
  routeModules: readonly string[];
  importedIds: (id: string) => readonly string[] | undefined;
  dynamicallyImportedIds: (id: string) => readonly string[] | undefined;
}

export function shellChunkGroups(graph: ShellGraph): {
  shell: Set<string>;
  publicShared: Set<string>;
  entryLazy: Set<string>;
} {
  const stop = new Set(graph.routeModules);
  const closure = (roots: readonly string[], dynamic: boolean) => {
    const seen = new Set<string>();
    const visit = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      for (const imported of graph.importedIds(id) ?? []) visit(imported);
      if (!dynamic) return;
      for (const imported of graph.dynamicallyImportedIds(id) ?? []) {
        if (!stop.has(imported)) visit(imported);
      }
    };
    for (const id of roots) visit(id);
    return seen;
  };
  const boot = closure(graph.entries, false);
  const publicReach = closure(graph.publicRoots, true);
  const entryReach = closure(graph.entries, true);
  const shell = new Set<string>();
  const publicShared = new Set<string>();
  const entryLazy = new Set<string>();
  const excluded = new Set([...graph.shellRoots, ...graph.publicRoots]);
  for (const id of closure(graph.shellRoots, false)) {
    if (boot.has(id) || excluded.has(id)) continue;
    if (publicReach.has(id)) publicShared.add(id);
    else if (entryReach.has(id)) entryLazy.add(id);
    else shell.add(id);
  }
  return { shell, publicShared, entryLazy };
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const clauseNames = (clause: string) =>
  clause
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !/^type\s/.test(part))
    .map((part) => part.split(/\s+as\s+/)[0]);

export function throughBarrel(options: {
  barrel: string;
  specifier: string;
  importedIds: (id: string) => readonly string[] | undefined;
  code: (id: string) => string | null | undefined;
  onFallback?: (id: string) => void;
}): (id: string) => readonly string[] | undefined {
  const { barrel, specifier, importedIds, code, onFallback } = options;
  const declaredBy = new Map<string, string>();
  const barrelDeps = importedIds(barrel) ?? [];
  for (const match of (code(barrel) ?? '').matchAll(
    /export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g
  )) {
    const target = match[2].replace(/^\.\//, '/');
    const id = barrelDeps.find((dep) => dep.replace(/\.[cm]?[jt]sx?$/, '').endsWith(target));
    if (!id) continue;
    for (const part of match[1].split(',')) {
      const exported = part
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (exported) declaredBy.set(exported, id);
    }
  }
  const quoted = `["']${escapeRegExp(specifier)}["']`;
  const namedImports = (source: string): string[] | null => {
    const mentions = source.match(new RegExp(quoted, 'g'))?.length ?? 0;
    const lists = [
      ...source.matchAll(
        new RegExp(`import\\s*(type\\s+)?\\{([^}]*)\\}\\s*from\\s*${quoted}`, 'g')
      ),
    ];
    return mentions > 0 && lists.length === mentions
      ? lists.flatMap((list) => (list[1] ? [] : clauseNames(list[2])))
      : null;
  };

  return (id) => {
    const deps = importedIds(id);
    if (!deps?.includes(barrel) || id === barrel) return deps;
    const names = namedImports(code(id) ?? '');
    const targets = names?.map((name) => declaredBy.get(name));
    if (!targets || targets.some((target) => target === undefined)) {
      onFallback?.(id);
      return deps;
    }
    return [...new Set(deps.flatMap((dep) => (dep === barrel ? (targets as string[]) : [dep])))];
  };
}

export function missingShellChunks(bundle: BundleLike): string[] {
  const names = new Set(Object.values(bundle).map((item) => item.name));
  return [...SHELL_CHUNK_NAMES].filter((name) => !names.has(name));
}

export function chunkImportMapping(bundle: BundleLike, base: string): Record<string, string> {
  const source = bundle['importmap.json']?.source;
  if (source === undefined) return {};
  const text = typeof source === 'string' ? source : new TextDecoder().decode(source);
  const { imports } = JSON.parse(text) as { imports: Record<string, string> };
  return Object.fromEntries(
    Object.entries(imports).map(([key, file]) => [key.slice(base.length), file.slice(base.length)])
  );
}

export function entryNamesRelease(bundle: BundleLike, release: string): boolean {
  const entry = bundle[entryFile(bundle)];
  return entry.code?.includes(release) ?? false;
}

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

export function lazyChunkFiles(bundle: BundleLike, boot: ReadonlySet<string>): string[] {
  return Object.values(bundle)
    .map((item) => item.fileName)
    .filter((file) => file.startsWith('assets/') && /\.(js|css)$/.test(file) && !boot.has(file))
    .sort();
}

interface ManifestEntryLike {
  url: string;
}

export function dropLazyFromManifest(lazy: ReadonlySet<string>) {
  if (lazy.size === 0) throw new Error('dropLazyFromManifest: the lazy chunk list is empty');
  return async <T extends ManifestEntryLike>(entries: T[]) => ({
    manifest: entries.filter((entry) => !lazy.has(entry.url)),
    warnings: [] as string[],
  });
}

export function lazyChunksJson(files: readonly string[], release: string, entry: string): string {
  return JSON.stringify({ release, entry, files });
}

export function listMatchesBuild(body: unknown, precachedUrls: readonly string[]): boolean {
  const entry = (body as { entry?: unknown } | null)?.entry;
  return typeof entry === 'string' && precachedUrls.includes(entry);
}

export function chunkKey(url: string, basePath: string): string {
  return new URL(url).pathname.slice(basePath.length);
}

export function chunksToDelete(cached: readonly string[], current: readonly string[]): string[] {
  if (current.length === 0) return [];
  const keep = new Set(current);
  return cached.filter((key) => !keep.has(key));
}

export function parseLazyChunksJson(body: unknown): string[] {
  const files = (body as { files?: unknown } | null)?.files;
  return Array.isArray(files)
    ? files.filter((file): file is string => typeof file === 'string')
    : [];
}

export interface RenderedChunkLike {
  name: string;
  moduleIds: readonly string[];
  imports: readonly string[];
  dynamicImports: readonly string[];
}

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
