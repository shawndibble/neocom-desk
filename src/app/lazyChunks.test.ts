import { describe, expect, it } from 'vitest';
import {
  bootClosure,
  chunkImportMapping,
  chunkKey,
  entryNamesRelease,
  chunksToDelete,
  dropLazyFromManifest,
  lazyChunkFiles,
  lazyChunksJson,
  entryFile,
  listMatchesBuild,
  missingShellChunks,
  parseLazyChunksJson,
  preloadGraphSignature,
  type BundleLike,
} from './lazyChunks';

function chunk(
  fileName: string,
  imports: string[] = [],
  extra: { isEntry?: boolean; name?: string; css?: string[] } = {}
) {
  return {
    type: 'chunk' as const,
    fileName,
    name: extra.name ?? fileName,
    isEntry: extra.isEntry ?? false,
    imports,
    viteMetadata: { importedCss: new Set(extra.css ?? []) },
  };
}
const css = (fileName: string) => ({ type: 'asset' as const, fileName });

function bundleOf(...items: Array<ReturnType<typeof chunk> | ReturnType<typeof css>>): BundleLike {
  return Object.fromEntries(items.map((i) => [i.fileName, i]));
}

describe('bootClosure', () => {
  it("is the entry's static imports, transitively, with the css they pull in", () => {
    const bundle = bundleOf(
      chunk('assets/index.js', ['assets/react.js'], { isEntry: true, css: ['assets/index.css'] }),
      chunk('assets/react.js', ['assets/scheduler.js']),
      chunk('assets/scheduler.js'),
      chunk('assets/Market.js', ['assets/react.js']),
      css('assets/index.css')
    );
    expect(bootClosure(bundle)).toEqual(
      new Set(['assets/index.js', 'assets/react.js', 'assets/scheduler.js', 'assets/index.css'])
    );
  });

  it('leaves out a route chunk the entry reaches only by dynamic import', () => {
    const bundle = bundleOf(
      Object.assign(chunk('assets/index.js', [], { isEntry: true }), {
        dynamicImports: ['assets/Market.js'],
      }),
      chunk('assets/Market.js')
    );
    expect(bootClosure(bundle).has('assets/Market.js')).toBe(false);
  });

  it('keeps the signed-in shell and what it statically needs, which boot preloads', () => {
    const bundle = bundleOf(
      chunk('assets/index.js', [], { isEntry: true }),
      chunk('assets/Layout-x.js', ['assets/nav.js'], { name: 'Layout' }),
      chunk('assets/Overview-x.js', [], { name: 'Overview' }),
      chunk('assets/nav.js'),
      chunk('assets/Market-x.js', [], { name: 'Market' })
    );
    const boot = bootClosure(bundle);
    expect(boot).toContain('assets/Layout-x.js');
    expect(boot).toContain('assets/Overview-x.js');
    expect(boot).toContain('assets/nav.js');
    expect(boot).not.toContain('assets/Market-x.js');
  });

  it('survives an import cycle', () => {
    const bundle = bundleOf(
      chunk('assets/index.js', ['assets/a.js'], { isEntry: true }),
      chunk('assets/a.js', ['assets/b.js']),
      chunk('assets/b.js', ['assets/a.js'])
    );
    expect(bootClosure(bundle).size).toBe(3);
  });

  it('throws when the bundle has no entry, so a broken build cannot precache nothing quietly', () => {
    expect(() => bootClosure(bundleOf(chunk('assets/a.js')))).toThrow(/entry/i);
  });

  it('follows an import named by its import-map key to the hashed file it maps to', () => {
    const bundle = bundleOf(
      chunk('assets/index-H1.js', ['assets/react-S.js'], { isEntry: true }),
      chunk('assets/react-H2.js', ['assets/scheduler-S.js']),
      chunk('assets/scheduler-H3.js')
    );
    const map = {
      'assets/react-S.js': 'assets/react-H2.js',
      'assets/scheduler-S.js': 'assets/scheduler-H3.js',
    };
    expect(bootClosure(bundle, map)).toEqual(
      new Set(['assets/index-H1.js', 'assets/react-H2.js', 'assets/scheduler-H3.js'])
    );
  });

  it('throws on an import that names no file, so the boot graph never shrinks quietly', () => {
    const bundle = bundleOf(chunk('assets/index.js', ['assets/react-S.js'], { isEntry: true }));
    expect(() => bootClosure(bundle)).toThrow(/assets\/react-S\.js/);
  });
});

describe('chunkImportMapping', () => {
  const asset = (source: string) => ({
    type: 'asset' as const,
    fileName: 'importmap.json',
    source,
  });

  it("maps each chunk's stable name to its hashed file, both under the base", () => {
    const bundle = {
      'importmap.json': asset(
        JSON.stringify({ imports: { '/assets/react-S.js': '/assets/react-H2.js' } })
      ),
    };
    expect(chunkImportMapping(bundle, '/')).toEqual({ 'assets/react-S.js': 'assets/react-H2.js' });
  });

  it('is empty without an import map', () => {
    expect(chunkImportMapping({}, '/')).toEqual({});
  });
});

describe('entryNamesRelease', () => {
  it('is true when the entry chunk carries the release, so its file name is per-build', () => {
    const entry = { ...chunk('assets/index-1.js', [], { isEntry: true }), code: 'x="app@1+abc"' };
    expect(entryNamesRelease(bundleOf(entry), 'app@1+abc')).toBe(true);
    expect(entryNamesRelease(bundleOf(entry), 'app@1+def')).toBe(false);
  });
});

describe('lazyChunkFiles', () => {
  const bundle = bundleOf(
    chunk('assets/index.js', [], { isEntry: true }),
    chunk('assets/Market.js'),
    chunk('assets/Ships.js'),
    css('assets/Market.css'),
    css('assets/index.css'),
    { type: 'asset' as const, fileName: 'icons/favicon.svg' }
  );

  it('lists the js and css assets outside the boot closure, sorted', () => {
    const boot = new Set(['assets/index.js', 'assets/index.css']);
    expect(lazyChunkFiles(bundle, boot)).toEqual([
      'assets/Market.css',
      'assets/Market.js',
      'assets/Ships.js',
    ]);
  });

  it('never lists anything outside assets/', () => {
    expect(lazyChunkFiles(bundle, new Set())).not.toContain('icons/favicon.svg');
  });
});

describe('dropLazyFromManifest', () => {
  const entries = [
    { url: 'index.html', revision: 'r', size: 1 },
    { url: 'assets/index-AAA.js', revision: null, size: 2 },
    { url: 'assets/Market-BBB.js', revision: null, size: 3 },
    { url: 'data/blueprints.json', revision: 'r2', size: 4 },
  ];

  it('removes the lazy chunks and nothing else', async () => {
    const transform = dropLazyFromManifest(new Set(['assets/Market-BBB.js']));
    const { manifest, warnings } = await transform(entries);
    expect(manifest.map((e) => e.url)).toEqual([
      'index.html',
      'assets/index-AAA.js',
      'data/blueprints.json',
    ]);
    expect(warnings).toEqual([]);
  });

  it('refuses an empty lazy list, which would silently precache every chunk again', () => {
    expect(() => dropLazyFromManifest(new Set())).toThrow(/empty/i);
  });
});

describe('lazyChunksJson', () => {
  it('carries the release and the files', () => {
    expect(
      JSON.parse(lazyChunksJson(['assets/a.js'], 'neocom-desk@1+abc', 'assets/index-1.js'))
    ).toEqual({ release: 'neocom-desk@1+abc', entry: 'assets/index-1.js', files: ['assets/a.js'] });
  });
});

describe('chunkKey', () => {
  it('is the path under the base, so it matches the list whatever the base is', () => {
    expect(chunkKey('https://x.app/assets/a-1.js', '/')).toBe('assets/a-1.js');
    expect(chunkKey('https://x.app/desk/assets/a-1.js?x=1', '/desk/')).toBe('assets/a-1.js');
  });
});

describe('chunksToDelete', () => {
  it('names the cached chunks the current build no longer lists', () => {
    expect(
      chunksToDelete(['assets/old.js', 'assets/keep.js'], ['assets/keep.js', 'assets/new.js'])
    ).toEqual(['assets/old.js']);
  });

  it('deletes nothing when the current list is empty, so a bad read never wipes the cache', () => {
    expect(chunksToDelete(['assets/a.js'], [])).toEqual([]);
  });
});

describe('parseLazyChunksJson', () => {
  it('reads what lazyChunksJson wrote', () => {
    expect(
      parseLazyChunksJson(JSON.parse(lazyChunksJson(['assets/a.js'], 'r', 'assets/index-1.js')))
    ).toEqual(['assets/a.js']);
  });

  it.each([null, undefined, 'x', {}, { files: 'assets/a.js' }])('is empty for %j', (body) => {
    expect(parseLazyChunksJson(body)).toEqual([]);
  });

  it('drops entries that are not strings', () => {
    expect(parseLazyChunksJson({ files: ['assets/a.js', 3, null] })).toEqual(['assets/a.js']);
  });
});

describe('entryFile', () => {
  it('is the entry chunk', () => {
    expect(
      entryFile(bundleOf(chunk('assets/a.js'), chunk('assets/index-1.js', [], { isEntry: true })))
    ).toBe('assets/index-1.js');
  });
});

describe('missingShellChunks', () => {
  it('names a shell chunk the bundle no longer has under its expected name', () => {
    const bundle = bundleOf(chunk('assets/Layout-1.js', [], { name: 'Layout' }));
    expect(missingShellChunks(bundle)).toEqual(['Overview']);
  });

  it('is empty when both are there', () => {
    const bundle = bundleOf(
      chunk('assets/Layout-1.js', [], { name: 'Layout' }),
      chunk('assets/Overview-1.js', [], { name: 'Overview' })
    );
    expect(missingShellChunks(bundle)).toEqual([]);
  });
});

describe('listMatchesBuild', () => {
  const precached = ['index.html', 'assets/index-NEW.js'];

  it("is true when the list's entry is one this worker precached", () => {
    expect(listMatchesBuild({ entry: 'assets/index-NEW.js' }, precached)).toBe(true);
  });

  it('is false for another build, so a worker never prunes a build it is not running', () => {
    expect(listMatchesBuild({ entry: 'assets/index-NEWER.js' }, precached)).toBe(false);
  });

  it('is false when the list names no entry', () => {
    expect(listMatchesBuild({}, precached)).toBe(false);
    expect(listMatchesBuild(null, precached)).toBe(false);
  });
});

describe('preloadGraphSignature', () => {
  /** A rendered chunk as `renderChunk`'s `meta.chunks` gives it, keyed by its preliminary file name. */
  const rendered = (
    name: string,
    moduleIds: string[],
    imports: string[] = [],
    dynamicImports: string[] = []
  ) => ({ name, moduleIds, imports, dynamicImports });

  const graph = () => ({
    'assets/routes-!~{1}~.js': rendered(
      'routes',
      ['src/routes.ts'],
      [],
      ['assets/Skills-!~{2}~.js']
    ),
    'assets/Skills-!~{2}~.js': rendered('Skills', ['src/Skills.tsx'], ['assets/isk-!~{3}~.js']),
    'assets/isk-!~{3}~.js': rendered('isk', ['src/lib/isk.ts']),
  });

  it('is empty for a chunk with no dynamic import, whose preload lists Vite never writes', () => {
    expect(preloadGraphSignature('assets/Skills-!~{2}~.js', graph())).toBe('');
  });

  it('names what each dynamic import pulls in, so a chunk whose preload list changes is renamed', () => {
    const before = preloadGraphSignature('assets/routes-!~{1}~.js', graph());
    const after = graph();
    after['assets/Skills-!~{2}~.js'].imports.push('assets/tree-!~{4}~.js');
    Object.assign(after, {
      'assets/tree-!~{4}~.js': rendered('tree', ['src/tree.tsx', 'src/tree.css']),
    });
    expect(preloadGraphSignature('assets/routes-!~{1}~.js', after)).not.toBe(before);
  });

  it('changes when a module moves into a chunk the import pulls in', () => {
    const before = preloadGraphSignature('assets/routes-!~{1}~.js', graph());
    const after = graph();
    after['assets/isk-!~{3}~.js'].moduleIds.push('src/lib/compactNumber.ts');
    expect(preloadGraphSignature('assets/routes-!~{1}~.js', after)).not.toBe(before);
  });

  it('ignores the preliminary file names, whose placeholders are positional', () => {
    const renumbered = {
      'assets/routes-!~{7}~.js': rendered(
        'routes',
        ['src/routes.ts'],
        [],
        ['assets/Skills-!~{8}~.js']
      ),
      'assets/Skills-!~{8}~.js': rendered('Skills', ['src/Skills.tsx'], ['assets/isk-!~{9}~.js']),
      'assets/isk-!~{9}~.js': rendered('isk', ['src/lib/isk.ts']),
    };
    expect(preloadGraphSignature('assets/routes-!~{7}~.js', renumbered)).toBe(
      preloadGraphSignature('assets/routes-!~{1}~.js', graph())
    );
  });

  it('throws on an import the graph does not have, rather than sign a partial list', () => {
    const broken = graph();
    broken['assets/Skills-!~{2}~.js'].imports.push('assets/gone-!~{5}~.js');
    expect(() => preloadGraphSignature('assets/routes-!~{1}~.js', broken)).toThrow(/gone/);
  });
});
