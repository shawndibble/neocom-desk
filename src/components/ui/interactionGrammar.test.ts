import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source guards for DESIGN.md §6c (interaction grammar): one cue per intent,
 * so a primitive owns each pattern and feature code composes it. Same shape as
 * `inlineLinkClassName.test.ts`: scan source, list offenders.
 *
 * Excluded everywhere: `src/components/ui` (the primitives own the patterns),
 * `src/features/pi` and `src/routes/PlanetaryIndustry*` (pending its own
 * overhaul), and test files.
 */

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = sourceFiles('src').filter(
  (f) =>
    !f.startsWith('src/components/ui/') &&
    !f.startsWith('src/features/pi/') &&
    !/^src\/routes\/PlanetaryIndustry/.test(f)
);
const read = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

interface Tag {
  name: string;
  attrs: string;
}

/** Every lowercase-named (HTML) JSX opening tag, with its raw attribute text. */
function htmlTags(raw: string): Tag[] {
  // Blank block comments (same length) so prose like "<button> — ..." isn't a tag.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const tags: Tag[] = [];
  const open = /(^|[\s(>{&|?:,])<([a-z][a-z0-9]*)(?=[\s/>])/g;
  for (let m = open.exec(src); m; m = open.exec(src)) {
    let i = open.lastIndex;
    let depth = 0;
    let quote = '';
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '/' && src[i + 1] === '/') {
        i = src.indexOf('\n', i);
        if (i < 0) break;
      } else if (c === '/' && src[i + 1] === '*') {
        i = src.indexOf('*/', i) + 1;
      } else if (c === '"' || c === "'" || (c === '`' && depth > 0)) quote = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0 && src[i - 1] !== '=') break;
    }
    tags.push({ name: m[2], attrs: src.slice(open.lastIndex, i) });
  }
  return tags;
}

/** The top-level statement starting at `from`: up to the next column-0 declaration. */
function statementAt(src: string, from: number): string {
  const next = src
    .slice(from + 1)
    .search(/\n(?=\/\*\*|export |const |function |interface |type |class |enum )/);
  return next < 0 ? src.slice(from) : src.slice(from, from + 1 + next);
}

/**
 * True when a className expression reaches one of `recipe`'s names or
 * patterns: inline, as a shared export, or through a same-file constant or
 * function (followed a few levels).
 */
function reachesRecipe(src: string, attrs: string, recipes: Recipes, depth = 0): boolean {
  if (recipes.pattern.test(attrs)) return true;
  for (const name of new Set(attrs.match(/\b[A-Za-z_]\w*\b/g) ?? [])) {
    if (recipes.names.has(name)) return true;
    const def = new RegExp(`(?:const|function)\\s+${name}\\b`).exec(src);
    if (def && depth < 3 && reachesRecipe(src, statementAt(src, def.index), recipes, depth + 1)) {
      return true;
    }
  }
  return false;
}

interface Recipes {
  pattern: RegExp;
  names: Set<string>;
}

/** Recipes = every export in src whose own statement matches `pattern`. */
function recipesMatching(pattern: RegExp, seed: string[]): Recipes {
  const names = new Set(seed);
  for (const f of sourceFiles('src')) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/export (?:const|function) (\w+)/g)) {
      if (pattern.test(statementAt(src, m.index))) names.add(m[1]);
    }
  }
  return { pattern, names };
}

const focusRecipes = recipesMatching(/focus-visible|focus:outline|focusRing/, [
  'focusRingClassName',
  'focusRingInsetClassName',
]);
const touchRecipes = recipesMatching(/\b(min-h|size|h)-11\b/, [
  'touchCheckboxLabelClassName',
  'tappableRowClassName',
]);

const hasUnfocusedButton = (src: string) =>
  htmlTags(src).some((t) => t.name === 'button' && !reachesRecipe(src, t.attrs, focusRecipes));

const offendersOf = (test: (src: string, file: string) => boolean) =>
  files.filter((f) => test(read.get(f)!, f));

const tagOffenders = (test: (tag: Tag) => boolean, allow: string[] = []) =>
  offendersOf((src, f) => !allow.includes(f) && htmlTags(src).some(test));

describe('guard internals', () => {
  it('does not leak a recipe into the export that follows it', () => {
    const src =
      "const MOBILE_NAV_IDLE = 'p-1 text-dim';\nconst MOBILE_NAV_ACTIVE = 'focus-visible:outline-2';\nexport const A = () => <button className={MOBILE_NAV_IDLE}>a</button>;\n";
    expect(hasUnfocusedButton(src)).toBe(true);
    expect(hasUnfocusedButton(src.replace('MOBILE_NAV_IDLE}', 'MOBILE_NAV_ACTIVE}'))).toBe(false);
  });

  it('keeps unfocused recipes out of the recipe sets', () => {
    expect(focusRecipes.names.has('controlHeightClassName')).toBe(false);
    expect(touchRecipes.names.has('disabledClassName')).toBe(false);
    expect(touchRecipes.names.has('selectedRowClassName')).toBe(false);
  });
});

describe('interaction grammar source guards (DESIGN.md §6c)', () => {
  it('writes target="_blank" only in ExternalLink', () => {
    expect(offendersOf((src) => /target=["{'`]*_blank/.test(src))).toEqual([]);
  });

  it('uses a dotted underline only in HintText, and a dashed one nowhere', () => {
    expect(offendersOf((src) => /decoration-dotted|\bunderline-dotted/.test(src))).toEqual([]);
    expect(offendersOf((src) => /decoration-dashed|\bunderline-dashed/.test(src))).toEqual([]);
  });

  it('puts no native title= on an HTML element (use Tooltip / HintText)', () => {
    // Component props (Panel, Modal, PageHeader `title=`) are capitalised and
    // never match: only lowercase HTML tags are checked. SVG <title> is a child
    // element, not an attribute.
    expect(tagOffenders((t) => /(^|\s)title=/.test(t.attrs))).toEqual([]);
  });

  it('places <RowMoreActions> only in audited files (DESIGN.md §6c restraint)', () => {
    // A ⋮ needs at least two real actions reachable nowhere else, one trailing
    // cluster at the row's right edge. Whether a given row meets that is a
    // judgement, so every file that hand-places a <RowMoreActions> is listed
    // here after review; a new file fails until someone makes that call. Delete
    // entries as menus are removed. (`DataTable`'s `rowMoreActions` column lives
    // in src/components/ui and is not scanned.)
    const audited = [
      'src/features/character/assetBrowserRows.tsx',
      'src/features/fittings/FittingAddPanel.tsx',
      'src/features/fittings/FittingFightersPanel.tsx',
      'src/features/fittings/FittingRackList.tsx',
      'src/features/fittings/FittingStartScreen.tsx',
      'src/features/fittings/FittingStatsSections.tsx',
      'src/features/industry/BuildPlanList.tsx',
      'src/features/market/CompareDrawer.tsx',
      'src/features/market/ItemContextMenu.tsx',
      'src/features/market/OpenOrdersList.tsx',
      'src/features/market/OrderHistoryList.tsx',
      'src/features/market/QuickbarList.tsx',
      'src/features/market/TransactionsDayList.tsx',
      'src/features/market/UsedInSection.tsx',
      'src/features/skills/SkillRowContextMenu.tsx',
      'src/routes/FittingCompare.tsx',
      'src/routes/Mail.tsx',
      'src/routes/Market.tsx',
    ];
    // Stale entries are harmless and left alone, so fix PRs never conflict on this list.
    const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, '$1');
    const placing = offendersOf((src) => /<RowMoreActions\b/.test(stripComments(src)));
    expect(placing.filter((f) => !audited.includes(f))).toEqual([]);
  });

  it('composes a focus-visible recipe on every raw <button>', () => {
    // A bare <button> must reach a focus-visible style: inline, via a shared
    // recipe, or via a same-file constant/function its className uses.
    // Exceptions, by file: styled by a stylesheet rule, not utilities.
    const exceptions = [
      'src/features/skills/planner/EntryList.tsx', // PriorityPill: ring drawn on the child via group-focus-visible
      'src/features/fittings/shipTree/FactionGrid.tsx', // .isis-faction (shipTree.css :focus-visible)
      'src/features/fittings/shipTree/IsisTile.tsx', // .isis-tile (shipTree.css :focus-visible)
      'src/features/fittings/shipTree/ShipTreeMap.tsx', // .isis-emblem (shipTree.css :focus-visible)
    ];
    expect(offendersOf((src, f) => !exceptions.includes(f) && hasUnfocusedButton(src))).toEqual([]);
  });

  it('uses no hover:bg-panel / hover:bg-line fill (rows use rowInteractiveClassName)', () => {
    // The `-2`, `-bright` etc. variants (hover:bg-panel-2, hover:bg-line-bright)
    // are deliberately allowed: only the bare tokens are the retired fills.
    expect(
      offendersOf((src) => /hover:bg-panel(?![-\w])|hover:bg-line(?![-\w])/.test(src))
    ).toEqual([]);
  });

  it('draws no ▸ / ▾ dingbat carets and no rotate-180 caret (use Disclosure Caret)', () => {
    // rotate-180 stays banned: a flipped CaretDown is the retired expand cue;
    // the sweep checklists replaced it with Disclosure's rotating Caret.
    expect(offendersOf((src) => /[▸▾]|\brotate-180\b/.test(src))).toEqual([]);
  });

  it('spells no touch-tier row height by hand (use tappableRowClassName)', () => {
    // `min-h-11 md:min-h-7` is `tappableRowClassName` in controlStyles.ts.
    expect(
      offendersOf((src) => /min-h-11[^'"`]*md:min-h-7|md:min-h-7[^'"`]*min-h-11/.test(src))
    ).toEqual([]);
  });

  it('puts every <Checkbox> in a label with a 44px touch target', () => {
    // The 16px native box can't carry its own touch target, so the wrapping
    // <label> must compose `tappableRowClassName` (a row) or
    // `touchCheckboxLabelClassName` (a lone box), or pin its own touch height.
    // Exceptions, by file: none.
    const exceptions: string[] = [];
    const offenders = files.flatMap((f) => {
      if (exceptions.includes(f)) return [];
      const src = read.get(f)!.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
      return [...src.matchAll(/<Checkbox\b/g)].flatMap((m) => {
        const before = src.slice(0, m.index);
        const open = before.lastIndexOf('<label');
        const label =
          open < 0 || open < before.lastIndexOf('</label>')
            ? undefined
            : htmlTags(src.slice(open, m.index)).find((t) => t.name === 'label');
        return label && reachesRecipe(src, label.attrs, touchRecipes)
          ? []
          : [`${f}:${before.split('\n').length}`];
      });
    });
    expect(offenders).toEqual([]);
  });
});
