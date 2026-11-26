import { describe, it, expect } from 'vitest';

const ALLOWED = new Set(['src/features/character/CharacterRowContextMenu.tsx']);

const sources = import.meta.glob<string>(['/src/features/**/*.tsx', '/src/routes/**/*.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const BARE_IMPORT = /import\s*\{[^}]*\bContextMenu\w*\b[^}]*\}\s*from\s*'@\/components\/ui'/;

describe('row menus', () => {
  it('are built on RowActionsMenu, not a bare ContextMenu', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    const offenders = Object.entries(sources)
      .filter(([path]) => !/\.test\.tsx$/.test(path))
      .filter(([, source]) => BARE_IMPORT.test(source))
      .map(([path]) => path.replace(/^\//, ''))
      .filter((path) => !ALLOWED.has(path));
    expect(offenders).toEqual([]);
  });
});
