import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizePath, type Plugin } from 'vite';
import { planLocaleSplit, type LocalePlan, type LocaleTree } from './localeSplit';

/**
 * Build-time split of `locales/en.json` (see `localeSplit.ts` for the rule).
 *
 * - `src/i18n/index.ts`'s `import en from './locales/en.json'` resolves to the
 *   shell half instead of the file.
 * - Every other source file that names a lazy key gets a static
 *   `import "virtual:neocom-locale/gN"` per group it needs, prepended on its
 *   first line; each group module registers its keys through
 *   `lazyResources.ts` as it is evaluated.
 *
 * Build only, like `phosphorWeightsPlugin`: dev and Vitest keep loading the
 * whole file through the untouched import, so nothing about editing en.json
 * or testing against it changes. Other importers of en.json (the service
 * worker's `pushHandler.ts`, tests) are not redirected either.
 */

const GROUP_PREFIX = 'virtual:neocom-locale/';
const RESOLVED_PREFIX = '\0neocom-locale/';
const SHELL_ID = `${RESOLVED_PREFIX}shell`;

/**
 * The group imports for one source file, prepended on its first line so every
 * later line keeps its number — the transform returns no sourcemap, which
 * tells the bundler positions did not move.
 */
export function prependGroupImports(code: string, groupIds: readonly string[]): string {
  return groupIds.map((id) => `import ${JSON.stringify(GROUP_PREFIX + id)};`).join('') + code;
}

export function groupModuleCode(tree: LocaleTree, registryPath: string): string {
  return [
    `import { addLazyResources } from ${JSON.stringify(registryPath)};`,
    `addLazyResources(${JSON.stringify(tree)});`,
  ].join('\n');
}

function sourceFiles(srcDir: string): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const entry of readdirSync(srcDir, { recursive: true, encoding: 'utf8' })) {
    const rel = normalizePath(entry);
    if (!/\.tsx?$/.test(rel) || /\.test\.tsx?$/.test(rel) || rel.endsWith('.d.ts')) continue;
    if (rel.startsWith('test/')) continue;
    const file = normalizePath(join(srcDir, entry));
    sources[file] = readFileSync(file, 'utf8');
  }
  return sources;
}

export function localeSplitPlugin(): Plugin {
  let root = process.cwd();
  let plan: LocalePlan | null = null;
  const paths = () => ({
    en: normalizePath(join(root, 'src/i18n/locales/en.json')),
    index: normalizePath(join(root, 'src/i18n/index.ts')),
    registry: normalizePath(join(root, 'src/i18n/lazyResources.ts')),
  });

  return {
    name: 'neocom-locale-split',
    apply: 'build',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
    },
    buildStart() {
      const { en } = paths();
      this.addWatchFile(en);
      plan = planLocaleSplit(
        JSON.parse(readFileSync(en, 'utf8')) as LocaleTree,
        sourceFiles(normalizePath(join(root, 'src')))
      );
    },
    resolveId(source, importer) {
      if (source.startsWith(GROUP_PREFIX)) {
        return { id: RESOLVED_PREFIX + source.slice(GROUP_PREFIX.length), moduleSideEffects: true };
      }
      if (
        source === './locales/en.json' &&
        importer &&
        normalizePath(importer.split('?')[0]) === paths().index
      ) {
        return SHELL_ID;
      }
      return null;
    },
    load(id) {
      if (!id.startsWith(RESOLVED_PREFIX) || !plan) return null;
      if (id === SHELL_ID) return `export default ${JSON.stringify(plan.shell)};`;
      const tree = plan.groups.get(id.slice(RESOLVED_PREFIX.length));
      if (!tree) this.error(`unknown locale group ${id.slice(RESOLVED_PREFIX.length)}`);
      return { code: groupModuleCode(tree, paths().registry), moduleSideEffects: true };
    },
    transform: {
      filter: { id: /\.tsx?(?:\?.*)?$/ },
      handler(code, id) {
        const groupIds = plan?.importsByFile.get(normalizePath(id.split('?')[0]));
        if (!groupIds) return null;
        return { code: prependGroupImports(code, groupIds), map: null };
      },
    },
  };
}
