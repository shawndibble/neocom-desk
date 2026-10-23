import { describe, expect, it } from 'vitest';
import {
  bootClosure,
  chunkKey,
  chunksToDelete,
  dropLazyFromManifest,
  lazyChunkFiles,
  lazyChunksJson,
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
    expect(JSON.parse(lazyChunksJson(['assets/a.js'], 'neocom-desk@1+abc'))).toEqual({
      release: 'neocom-desk@1+abc',
      files: ['assets/a.js'],
    });
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
