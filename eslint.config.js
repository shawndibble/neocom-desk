import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dev-dist',
      'coverage',
      'playwright-report',
      'test-results',
      '.claude/worktrees',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['src/components/ui/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "JSXOpeningElement[name.name='input'] > JSXAttribute[name.name='type'][value.value='search']",
          message: 'Use SearchInput from src/components/ui instead of a raw <input type="search">.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'radix-ui',
              message: 'Import Radix primitives through src/components/ui, not directly.',
            },
            {
              // Not only a layering rule, a speed one: this barrel re-exports
              // 3045 icons and costs ~1.4s to import, which Vitest pays once
              // per test file whose graph reaches it. `src/components/ui`
              // (exempt above) imports each icon from `dist/csr/<Name>`.
              name: '@phosphor-icons/react',
              message:
                'Import icons from src/components/ui/icons, not the barrel — it pulls in 3045 modules.',
            },
          ],
        },
      ],
    },
  },
  {
    // These wrapper files alias radix-ui root/trigger parts under new names
    // (`export const Select = SelectPrimitive.Root`) per docs/adr/0004 — a
    // deliberate re-export, not a component definition, so fast-refresh
    // can't verify these files "only export components" and warns on
    // every one. Scoped narrowly to the three affected wrappers.
    files: [
      'src/components/ui/ContextMenu.tsx',
      'src/components/ui/DropdownMenu.tsx',
      'src/components/ui/Popover.tsx',
      'src/components/ui/Select.tsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  }
);
