import { describe, it, expect } from 'vitest';

const sources = import.meta.glob<string>(
  ['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}', '!/src/**/*.d.ts', '!/src/test/**'],
  { query: '?raw', import: 'default', eager: true }
);

const ENTRY = '/src/main.tsx';

const SIGNED_IN_SHELL = ['/src/app/Layout.tsx', '/src/routes/Overview.tsx'];

function stripLineComments(source: string): string {
  return source.replace(/^\s*\/\/.*$/gm, '');
}

function staticSpecifiers(source: string): string[] {
  const code = stripLineComments(source);
  const out: string[] = [];
  const fromClause =
    /(?:^|[\n;])\s*(import|export)\s+(type\s+)?([^;'"]*?)\s*from\s*['"]([^'"]+)['"]/g;
  for (const match of code.matchAll(fromClause)) {
    if (match[2]) continue;
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
  } else return undefined;
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
  return undefined;
}

const isFirebaseSpecifier = (specifier: string) =>
  specifier === 'firebase' ||
  specifier.startsWith('firebase/') ||
  specifier.startsWith('@firebase/');

interface StaticGraph {
  parent: Map<string, string | null>;
  firebaseLeaks: string[];
}

function walkFrom(roots: string[]): StaticGraph {
  const parent = new Map<string, string | null>(roots.map((root) => [root, null]));
  const queue = [...roots];
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

const graph = walkFrom([ENTRY]);
const bootGraph = walkFrom([ENTRY, ...SIGNED_IN_SHELL]);

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
          ` * import { gone } from './jsdoc';`,
          `const input = '<input accept="image/*">';`,
          `import { j } from './j';`,
          `/** a later comment */`,
          `import { k } from './k';`,
        ].join('\n')
      )
    ).toEqual(['./a', './d', './f', '@/h', './j', './k', './g.css']);
  });

  it('reaches a real slice of the app from the entry', () => {
    expect(ENTRY in sources).toBe(true);
    expect(resolve(ENTRY, './app/App')).toBe('/src/app/App.tsx');
    expect(graph.parent.has('/src/routes/Login.tsx')).toBe(true);
    expect(graph.parent.has('/src/app/RequireCharacter.tsx')).toBe(true);
    expect(bootGraph.parent.has('/src/features/notifications/projectionUpload.ts')).toBe(true);
  });

  it('keeps the signed-in shell out of the entry chunk', () => {
    const reached = SIGNED_IN_SHELL.filter((file) => graph.parent.has(file)).map((file) =>
      chainTo(graph.parent, file)
    );
    expect(reached).toEqual([]);
  });

  it('keeps the boot shell preload light: nothing it imports pulls in more code', () => {
    const preload = '/src/app/bootShellPreload.ts';
    const reached = new Set<string>([preload]);
    const bare: string[] = [];
    const queue = [preload];
    while (queue.length > 0) {
      const file = queue.shift()!;
      for (const specifier of staticSpecifiers(sources[file])) {
        const target = resolve(file, specifier);
        if (!target) bare.push(`${file} -> ${specifier}`);
        else if (!reached.has(target)) {
          reached.add(target);
          queue.push(target);
        }
      }
    }
    expect(bare).toEqual([]);
    expect([...reached].sort()).toEqual([
      '/src/app/bootShellPreload.ts',
      '/src/app/routeChunks.ts',
      '/src/app/routerPath.ts',
      '/src/app/signedInShellHint.ts',
      '/src/app/staleBuildState.ts',
      '/src/lib/safeLocalStorage.ts',
    ]);
  });

  it('reaches no firebase import without crossing a dynamic import()', () => {
    expect(bootGraph.firebaseLeaks).toEqual([]);
  });

  it('leaves the boot cache warm-up (and every feature loader it imports) to its own chunk', () => {
    const file = '/src/app/prefetch.ts';
    expect(bootGraph.parent.has(file) ? chainTo(bootGraph.parent, file) : null).toBeNull();
  });
});

describe('Share Link import graph', () => {
  const shared = walkFrom(['/src/routes/SharedLink.tsx']);

  it('reaches a real slice of the page', () => {
    expect(shared.parent.has('/src/features/share/ShareShell.tsx')).toBe(true);
  });

  it("loads each share type's screen on demand, not with the route", () => {
    const reached = [
      '/src/routes/FittingShared.tsx',
      '/src/features/fittings/AbyssalWeatherPicker.tsx',
      '/src/features/market/AppraisalShareScreen.tsx',
      '/src/features/travel/DscanShareScreen.tsx',
      '/src/features/travel/sharedDscanSeed.ts',
      '/src/features/survey/SurveyShareScreen.tsx',
    ].filter((file) => shared.parent.has(file));
    expect(reached).toEqual([]);
  });
});
