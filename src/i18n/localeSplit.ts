export type LocaleTree = { [key: string]: string | LocaleTree };

export const LAZY_SECTIONS: readonly string[] = [
  'industry',
  'fittings',
  'market',
  'settings',
  'piShared',
  'miningTax',
  'survey',
  'plans',
  'contractSearch',
  'corp',
  'piPlan',
  'piColonies',
  'bpcContracts',
  'wallet',
  'ships',
  'assets',
  'pi',
  'calendar',
  'skills',
  'characters',
  'contacts',
  'communities',
  'travel',
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
  'corpTaxBook',
  'srp',
  'srpMember',
  'vetting',
];

export const STARTUP_ROOTS: readonly string[] = [
  'main.tsx',
  'app/Layout.tsx',
  'routes/Overview.tsx',
];

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

export function referencedLeaves(
  code: string,
  leaves: readonly string[],
  sections: readonly string[]
): Set<string> {
  const found = new Set<string>();
  if (sections.length === 0) return found;
  const names = [...sections].sort((x, y) => y.length - x.length).map(escape);
  const path = new RegExp(
    `['"\`]((?:${names.join('|')})(?![\\w-])(?:\\.[\\w-]+)*)(\\.)?(\\$\\{)?`,
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
    if (!key.includes('.') && !(dot && open)) continue;
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

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
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
  for (let i = keys.length - 2; i >= 0; i--) {
    if (Object.keys(parents[i + 1]).length > 0) break;
    delete parents[i][keys[i]];
  }
}

export interface LocalePlan {
  shell: LocaleTree;
  groups: Map<string, LocaleTree>;
  importsByFile: Map<string, string[]>;
}

export function planLocaleSplit(
  en: LocaleTree,
  sources: Readonly<Record<string, string>>,
  lazySections: readonly string[] = LAZY_SECTIONS,
  startupFiles: ReadonlySet<string> = new Set(),
  srcRoot = ''
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
    if (files.some((file) => startupFiles.has(file))) continue;
    const signature = files.join('\n');
    const group = bySignature.get(signature);
    if (group) group.push(leaf);
    else bySignature.set(signature, [leaf]);
  }

  const shell = structuredClone(en);
  const groups = new Map<string, LocaleTree>();
  const importsByFile = new Map<string, string[]>();
  const taken = new Set<string>();
  [...bySignature.keys()].sort().forEach((signature) => {
    const relative = signature
      .split('\n')
      .map((file) =>
        srcRoot && file.startsWith(`${srcRoot}/`) ? file.slice(srcRoot.length + 1) : file
      )
      .join('\n');
    let id = `locale-${fnv1a(relative)}`;
    while (taken.has(id)) id += 'x';
    taken.add(id);
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

export function staticImportClosure(
  sources: Readonly<Record<string, string>>,
  entries: readonly string[],
  srcRoot: string
): Set<string> {
  const specifiers = (code: string) => {
    const bare = code.replace(/^\s*\/\/.*$/gm, '');
    const out: string[] = [];
    for (const m of bare.matchAll(
      /(?:^|[\n;])\s*(import|export)\s+(type\s+)?([^;'"]*?)\s*from\s*['"]([^'"]+)['"]/g
    )) {
      if (!m[2]) out.push(m[4]);
    }
    for (const m of bare.matchAll(/(?:^|[\n;])\s*import\s*['"]([^'"]+)['"]/g)) out.push(m[1]);
    return out;
  };
  const resolve = (from: string, specifier: string): string | undefined => {
    let base: string;
    if (specifier.startsWith('@/')) base = `${srcRoot}/${specifier.slice(2)}`;
    else if (specifier.startsWith('.')) {
      const parts = from.split('/').slice(0, -1);
      for (const segment of specifier.split('/')) {
        if (segment === '..') parts.pop();
        else if (segment !== '.') parts.push(segment);
      }
      base = parts.join('/');
    } else return undefined;
    base = base.replace(/\?.*$/, '');
    for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
      if (`${base}${ext}` in sources) return `${base}${ext}`;
    }
    return undefined;
  };
  const seen = new Set<string>(entries);
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.shift()!;
    for (const specifier of specifiers(sources[file] ?? '')) {
      const target = resolve(file, specifier);
      if (target && !seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return seen;
}
