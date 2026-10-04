import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// Shared by every non-primitive file. Flat config replaces a rule's options
// rather than merging them, so a later block that adds selectors for a
// narrower glob must re-list these.
const restrictedSyntax = [
  {
    selector:
      "JSXOpeningElement[name.name='input'] > JSXAttribute[name.name='type'][value.value='search']",
    message: 'Use SearchInput from src/components/ui instead of a raw <input type="search">.',
  },
  {
    selector:
      "JSXOpeningElement[name.name='input'] > JSXAttribute[name.name='type'][value.value='checkbox']",
    message: 'Use Checkbox from src/components/ui instead of a raw <input type="checkbox">.',
  },
  {
    selector:
      "JSXOpeningElement[name.name='input'] > JSXAttribute[name.name='type'][value.value='radio']",
    message: 'Use Radio from src/components/ui instead of a raw <input type="radio">.',
  },
  {
    selector: "JSXOpeningElement[name.name='textarea']",
    message: 'Use TextArea from src/components/ui instead of a raw <textarea>.',
  },
  {
    // A typed character is not an icon (DESIGN.md §5). Only-child, so a
    // sign before an amount (`+<IskAmount …/>`) stays legal. Pinned by
    // scripts/lib/typedGlyphLint.test.mjs.
    selector: 'JSXText[value=/^\\s*(−|\\+|Aa)\\s*$/]:first-child:last-child',
    message:
      'A typed "−", "+" or "Aa" is not an icon — use IconButton with an Icon.* glyph (e.g. Icon.Decrease / Icon.Increase).',
  },
];

// Sort direction is always Icon.Sort / Icon.Ascending / Icon.Descending
// (DESIGN.md §5). A text arrow is only legal inside DataTable's stacked-mode
// native <option>, which can only show text. Pinned by
// scripts/lib/sortArrowLint.test.mjs.
const sortArrowMessage =
  'Draw sort direction with Icon.Sort / Icon.Ascending / Icon.Descending, not a "↑" / "↓" character (DESIGN.md §5).';
const restrictedImportPaths = [
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
];

const sortArrowSyntax = [
  { selector: 'Literal[value=/[↑↓]/]', message: sortArrowMessage },
  { selector: 'TemplateElement[value.raw=/[↑↓]/]', message: sortArrowMessage },
  { selector: 'JSXText[value=/[↑↓]/]', message: sortArrowMessage },
];

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
      'no-restricted-syntax': ['error', ...restrictedSyntax],
      'no-restricted-imports': ['error', { paths: restrictedImportPaths }],
    },
  },
  {
    // Mining Tax writes go through ledgerActions.ts, which makes each one a
    // single transaction that schedules its sync after commit. Only it and
    // the load-time repairs (reconcile, snapshot) touch the record
    // primitives directly.
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/components/ui/**',
      'src/features/miningTax/ledgerActions.ts',
      'src/features/miningTax/reconcile.ts',
      'src/features/miningTax/snapshot.ts',
      'src/features/miningTax/assignments.test.ts',
      'src/features/miningTax/reconcile.test.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: restrictedImportPaths,
          patterns: [
            {
              group: ['./assignments', '@/features/miningTax/assignments'],
              message: 'Write Mining Tax Assignments through ./ledgerActions, not the primitives.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.tsx'],
    ignores: ['src/components/ui/**'],
    rules: {
      'no-restricted-syntax': ['error', ...restrictedSyntax, ...sortArrowSyntax],
    },
  },
  {
    files: ['src/components/ui/**/*.tsx'],
    ignores: ['src/components/ui/DataTable.tsx', 'src/components/ui/DataTable.test.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...sortArrowSyntax],
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
