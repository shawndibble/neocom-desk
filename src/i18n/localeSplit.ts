/**
 * How the build splits `locales/en.json` so feature-page copy stops loading
 * with the shell. Pure: `localeSplitPlugin.ts` feeds it the file and the
 * sources and turns the answer into modules.
 *
 * `en.json` stays the one file anyone edits. At build time every source file
 * is scanned for the keys it names; each key in a lazy section is placed in a
 * group with the other keys named by exactly the same files, and every one of
 * those files gets a static import of its groups. The bundler then puts each
 * group wherever its importers are: beside the shell when the shell names it,
 * inside a route chunk when only that route does. A module's static imports
 * run before it does, so a key is registered before any component that names
 * it can render — no route loader has to await anything.
 *
 * Anything the scan can't prove a home for stays in the shell: every section
 * not on `LAZY_SECTIONS` (so a new section defaults eager) and every lazy key
 * no source names. The scan is deliberately generous — a false match only
 * makes a key load earlier than it had to.
 */

export type LocaleTree = { [key: string]: string | LocaleTree };

/**
 * Sections whose keys may leave the shell. The shell sections — login,
 * notifications, overview, nav, common, sync, boot, error, reauth and the
 * rest — are simply not listed, and neither is any section added later until
 * someone lists it here.
 */
export const LAZY_SECTIONS: readonly string[] = [
  'industry',
  'fittings',
  'market',
  'settings',
  'piAdvisor',
  'miningTax',
  'plans',
  'contractSearch',
  'corp',
  'piPlan',
  'bpcContracts',
  'wallet',
  'ships',
  'assets',
  'pi',
  'calendar',
  'skills',
  'characters',
  'contacts',
  'contracts',
  'mail',
  'loyaltyStore',
  'orders',
  'skillCompare',
  'jumpRange',
  'clones',
  'employmentHistory',
  'fittingShare',
  'appraisalShare',
  'contractDetail',
  'loyalty',
];

/** Every leaf key under `sections`, dot-joined (`market.orders.buy`). */
export function leafPaths(tree: LocaleTree, sections: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (node: string | LocaleTree, path: string) => {
    if (typeof node === 'string') out.push(path);
    else for (const [key, child] of Object.entries(node)) walk(child, `${path}.${key}`);
  };
  for (const section of sections) if (section in tree) walk(tree[section], section);
  return out;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The leaves in `leaves` that `code` can name. Three shapes:
 *
 * - a string starting with a key path (`'market.orders.buy'`, `i18nKey="…"`):
 *   that leaf, its plural/context variants (`_one`, `_other`, …), and every
 *   leaf under it when the path is a subtree (`returnObjects`, a prefix
 *   constant later extended with `${BASE}.title`);
 * - a template that continues the path (`` `market.orders.${side}` ``,
 *   `` `market.sort${dir}` ``): every leaf the completion could reach;
 * - a template whose section is itself a variable (`` `${ns}.reauthHint` ``):
 *   that key in every lazy section.
 */
export function referencedLeaves(
  code: string,
  leaves: readonly string[],
  sections: readonly string[]
): Set<string> {
  const found = new Set<string>();
  if (sections.length === 0) return found;
  const path = new RegExp(
    `['"\`]((?:${sections.map(escape).join('|')})(?:\\.[\\w-]+)*)(\\.)?(\\$\\{)?`,
    'g'
  );
  const bySection = new Map<string, string[]>();
  for (const leaf of leaves) {
    const section = leaf.slice(0, leaf.indexOf('.'));
    const list = bySection.get(section);
    if (list) list.push(leaf);
    else bySection.set(section, [leaf]);
  }
  for (const [, key, dot, open] of code.matchAll(path)) {
    if (!key.includes('.') && !(dot && open)) continue; // a bare section name
    const section = key.includes('.') ? key.slice(0, key.indexOf('.')) : key;
    for (const leaf of bySection.get(section) ?? []) {
      if (dot && open) {
        if (leaf.startsWith(`${key}.`)) found.add(leaf);
      } else if (open) {
        if (key.includes('.') && leaf.startsWith(key)) found.add(leaf);
      } else if (leaf === key || leaf.startsWith(`${key}.`) || leaf.startsWith(`${key}_`)) {
        found.add(leaf);
      }
    }
  }
  for (const [, suffix] of code.matchAll(/`\$\{[^}`]*\}\.([\w-]+)/g)) {
    for (const leaf of leaves) {
      const segments = leaf.split('.').slice(1);
      if (segments.some((s) => s === suffix || s.startsWith(`${suffix}_`))) found.add(leaf);
    }
  }
  return found;
}

function getLeaf(tree: LocaleTree, path: string): string {
  let node: string | LocaleTree = tree;
  for (const key of path.split('.')) node = (node as LocaleTree)[key];
  return node as string;
}

function setLeaf(tree: LocaleTree, path: string, value: string): void {
  const keys = path.split('.');
  let node = tree;
  for (const key of keys.slice(0, -1)) node = (node[key] ??= {}) as LocaleTree;
  node[keys[keys.length - 1]] = value;
}

function deleteLeaf(tree: LocaleTree, path: string): void {
  const keys = path.split('.');
  const parents: LocaleTree[] = [tree];
  for (const key of keys.slice(0, -1)) parents.push(parents[parents.length - 1][key] as LocaleTree);
  delete parents[parents.length - 1][keys[keys.length - 1]];
  // Drop subtrees the removal emptied, so the shell carries no `{}` husks.
  for (let i = keys.length - 2; i >= 0; i--) {
    if (Object.keys(parents[i + 1]).length > 0) break;
    delete parents[i][keys[i]];
  }
}

export interface LocalePlan {
  /** Loads with the app: every non-lazy section plus lazy keys nothing names. */
  shell: LocaleTree;
  /** Group id -> the keys named by exactly one set of files. */
  groups: Map<string, LocaleTree>;
  /** Source file -> the groups it imports. Files naming no lazy key are absent. */
  importsByFile: Map<string, string[]>;
}

export function planLocaleSplit(
  en: LocaleTree,
  sources: Readonly<Record<string, string>>,
  lazySections: readonly string[] = LAZY_SECTIONS
): LocalePlan {
  const sections = lazySections.filter((s) => typeof en[s] === 'object');
  const leaves = leafPaths(en, sections);

  const namedBy = new Map<string, string[]>();
  for (const file of Object.keys(sources).sort()) {
    for (const leaf of referencedLeaves(sources[file], leaves, sections)) {
      const files = namedBy.get(leaf);
      if (files) files.push(file);
      else namedBy.set(leaf, [file]);
    }
  }

  const bySignature = new Map<string, string[]>();
  for (const [leaf, files] of namedBy) {
    const signature = files.join('\n');
    const group = bySignature.get(signature);
    if (group) group.push(leaf);
    else bySignature.set(signature, [leaf]);
  }

  const shell = structuredClone(en);
  const groups = new Map<string, LocaleTree>();
  const importsByFile = new Map<string, string[]>();
  [...bySignature.keys()].sort().forEach((signature, index) => {
    const id = `g${index}`;
    const tree: LocaleTree = {};
    for (const leaf of bySignature.get(signature)!) {
      setLeaf(tree, leaf, getLeaf(en, leaf));
      deleteLeaf(shell, leaf);
    }
    groups.set(id, tree);
    for (const file of signature.split('\n')) {
      const ids = importsByFile.get(file);
      if (ids) ids.push(id);
      else importsByFile.set(file, [id]);
    }
  });

  return { shell, groups, importsByFile };
}
