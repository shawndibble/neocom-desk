import { describe, it, expect } from 'vitest';

/**
 * Every row menu is a `RowActionsMenu` (right-click plus a visible More-actions
 * button, DESIGN.md §4). A bare `ContextMenu*` import from `@/components/ui`
 * in a feature or route builds a right-click-only menu, so it must be on this
 * allowlist — which lists only the legitimate exceptions.
 */
const ALLOWED = new Set([
  // Single Copy event ID on a fixed-height board row.
  'src/features/character/EventContextMenu.tsx',
  // Table-only shortcuts to pages the nav already reaches.
  'src/features/character/CharacterRowContextMenu.tsx',
  // Mail rows: tracked by a sibling ticket.
  'src/features/character/MailRowContextMenu.tsx',
  // No mounted call site (dead code, separate cleanup).
  'src/features/notifications/NotificationContextMenu.tsx',
  // Build Plan menus carry their own visible twins.
  'src/features/industry/BuildPlanContextMenu.tsx',
  'src/features/industry/BuildPlanList.tsx',
  'src/features/industry/BuildPlanRowContextMenu.tsx',
  // Hand-rolled wrapper that provides RowActionsContext itself.
  'src/features/skills/SkillRowContextMenu.tsx',
  // Component gallery demonstrating the primitive.
  'src/routes/Styleguide.tsx',
]);

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
