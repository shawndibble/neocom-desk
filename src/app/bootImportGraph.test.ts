import { describe, it, expect } from 'vitest';

/**
 * Firebase must stay out of the startup bundle (see the boundary note in
 * `src/sync/index.ts`): every path from `src/main.tsx` to a module that
 * imports `firebase/*` or `@/sync/firebaseApp` has to cross a dynamic
 * `import()`, so Vite splits it into an async chunk. A single static import
 * anywhere along the way drags the whole SDK into the entry chunk — it has
 * leaked back that way before (analytics, web push, the projection upload).
 *
 * This walks the *static* import graph from the entry. Type-only imports are
 * erased by the compiler and dynamic `import()` is the escape hatch, so both
 * are ignored.
 */
const sources = import.meta.glob<string>(
  ['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}', '!/src/**/*.d.ts', '!/src/test/**'],
  { query: '?raw', import: 'default', eager: true }
);

const ENTRY = '/src/main.tsx';

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Static, value-level specifiers: `import x from`, `export … from`, `import 'x'`. */
function staticSpecifiers(source: string): string[] {
  const code = stripComments(source);
  const out: string[] = [];
  const fromClause =
    /(?:^|[\n;])\s*(import|export)\s+(type\s+)?([^;'"]*?)\s*from\s*['"]([^'"]+)['"]/g;
  for (const match of code.matchAll(fromClause)) {
    if (match[2]) continue; // `import type` / `export type`
    out.push(match[4]);
  }
  const bare = /(?:^|[\n;])\s*import\s*['"]([^'"]+)['"]/g;
  for (const match of code.matchAll(bare)) out.push(match[1]);
  return out;
}

function resolve(from: string, specifier: string): string | undefined {
  let base: string;
  if (specifier.startsWith('@/')) base = `/src/${specifier.slice(2)}`;
  else if (specifier.startsWith('.')) {
    const parts = from.split('/').slice(0, -1);
    for (const segment of specifier.split('/')) {
      if (segment === '..') parts.pop();
      else if (segment !== '.') parts.push(segment);
    }
    base = parts.join('/');
  } else return undefined; // bare package: a leaf, checked by the caller
  base = base.replace(/\?.*$/, '');
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    if (candidate in sources) return candidate;
  }
  return undefined; // css, json, svg, …
}

const isFirebaseSpecifier = (specifier: string) =>
  specifier === 'firebase' ||
  specifier.startsWith('firebase/') ||
  specifier.startsWith('@firebase/');

interface StaticGraph {
  /** Each reached module's importer, for printing the chain that reached it. */
  parent: Map<string, string | null>;
  /** Every Firebase specifier reached, with the chain from the entry. */
  firebaseLeaks: string[];
}

function walkFromEntry(): StaticGraph {
  const parent = new Map<string, string | null>([[ENTRY, null]]);
  const queue = [ENTRY];
  const firebaseLeaks: string[] = [];
  while (queue.length > 0) {
    const file = queue.shift()!;
    for (const specifier of staticSpecifiers(sources[file])) {
      if (isFirebaseSpecifier(specifier)) {
        firebaseLeaks.push(`${chainTo(parent, file)} -> ${specifier}`);
        continue;
      }
      const target = resolve(file, specifier);
      if (target && !parent.has(target)) {
        parent.set(target, file);
        queue.push(target);
      }
    }
  }
  return { parent, firebaseLeaks };
}

function chainTo(parent: Map<string, string | null>, file: string): string {
  const chain: string[] = [];
  for (let at: string | null | undefined = file; at; at = parent.get(at)) chain.unshift(at);
  return chain.join(' -> ');
}

const graph = walkFromEntry();

describe('startup import graph', () => {
  it('parses the forms of import it needs to', () => {
    expect(
      staticSpecifiers(
        [
          `import { a, type B } from './a';`,
          `import type { C } from './c';`,
          `export { d } from './d';`,
          `export type { E } from './e';`,
          `export * from './f';`,
          `import './g.css';`,
          `import {\n  h,\n  i,\n} from '@/h';`,
          `const lazy = () => import('./lazy');`,
          `// import { gone } from './comment';`,
          `/* import { gone } from './block'; */`,
        ].join('\n')
      )
    ).toEqual(['./a', './d', './f', '@/h', './g.css']);
  });

  it('reaches a real slice of the app from the entry', () => {
    expect(ENTRY in sources).toBe(true);
    expect(resolve(ENTRY, './app/App')).toBe('/src/app/App.tsx');
    expect(graph.parent.has('/src/app/Layout.tsx')).toBe(true);
    expect(graph.parent.has('/src/features/notifications/projectionUpload.ts')).toBe(true);
  });

  it('reaches no firebase import without crossing a dynamic import()', () => {
    expect(graph.firebaseLeaks).toEqual([]);
  });

  it('leaves the boot cache warm-up (and every feature loader it imports) to its own chunk', () => {
    const file = '/src/app/prefetch.ts';
    expect(graph.parent.has(file) ? chainTo(graph.parent, file) : null).toBeNull();
  });
});
