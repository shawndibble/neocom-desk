import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Catalogue ratchet: every component exported from `src/components/ui` has a
 * story (`<Module>.stories.tsx` beside its source) or sits on UNSTORIED. The
 * list may only shrink. Agents look components up in Storybook, so a gap
 * there sends them back to hand-drawn HTML.
 */

const UI_DIR = 'src/components/ui';

/** Today's unstoried components. Delete a name once its story lands. */
const UNSTORIED = [
  'AlertsBell',
  'Caret',
  'CharacterAvatar',
  'ColumnPickerMenu',
  'Disclosure',
  'EveSsoButton',
  'IconButton',
  'IskAmount',
  'IskFigureGroup',
  'LogoMark',
  'RegionSelect',
  'RowCaret',
  'StandingIcon',
  'TypeIcon',
];

/** Pinned size. Removing a name means lowering this; adding a name fails. */
const PINNED_COUNT = 14;

/** Component name -> source module, from the value (non-type) re-exports in index.ts. */
function exportedComponents(): Map<string, string> {
  const source = readFileSync(join(UI_DIR, 'index.ts'), 'utf8');
  const components = new Map<string, string>();
  for (const [, names, module] of source.matchAll(
    /^export\s*\{([^}]*)\}\s*from\s*'\.\/(\w+)';/gm
  )) {
    for (const raw of names.split(',')) {
      const name = raw.trim();
      // PascalCase only: skips hooks, helpers, SHOUTING constants and `type X`.
      if (/^[A-Z][a-z]\w*$/.test(name) && !name.endsWith('Context')) components.set(name, module);
    }
  }
  return components;
}

const components = exportedComponents();
const hasStory = (module: string) => existsSync(join(UI_DIR, `${module}.stories.tsx`));
const unstoried = [...components].filter(([, module]) => !hasStory(module)).map(([name]) => name);

describe('ui story coverage', () => {
  it('finds the primitives', () => {
    expect(components.size).toBeGreaterThan(50);
  });

  it('every component has a story or is on the allowlist', () => {
    const missing = unstoried.filter((name) => !UNSTORIED.includes(name));
    expect(
      missing,
      `No story for ${missing.join(', ')}. Add src/components/ui/<Module>.stories.tsx ` +
        `(see Button.stories.tsx). Do not add to UNSTORIED in storyCoverage.test.ts.`
    ).toEqual([]);
  });

  it('allowlist only lists components that still lack a story', () => {
    const stale = UNSTORIED.filter((name) => !unstoried.includes(name));
    expect(
      stale,
      `${stale.join(', ')} now ha${stale.length === 1 ? 's' : 've'} a story or no longer exist${
        stale.length === 1 ? 's' : ''
      }. Remove from UNSTORIED in storyCoverage.test.ts and lower PINNED_COUNT.`
    ).toEqual([]);
  });

  it('allowlist has no duplicates and never grows', () => {
    expect(new Set(UNSTORIED).size).toBe(UNSTORIED.length);
    expect(
      UNSTORIED.length,
      'UNSTORIED may only shrink. Write the story instead; after removing a name, lower PINNED_COUNT.'
    ).toBe(PINNED_COUNT);
  });
});
