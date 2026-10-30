import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// Raw text-like <input>s: banned in app code, fine in test fixtures (no
// styling to be consistent with). The legit raw input is type="file".
const rawInputSyntax = [
  {
    selector:
      "JSXOpeningElement[name.name='input'] > JSXAttribute[name.name='type'][value.value=/^(text|date|number|datetime-local|time|email|password|url|tel|month)$/]",
    message: 'Use TextInput from src/components/ui instead of a raw text-like <input>.',
  },
  {
    selector: "JSXOpeningElement[name.name='input']:not(:has(> JSXAttribute[name.name='type']))",
    message: 'Use TextInput from src/components/ui instead of a raw <input> with no type.',
  },
];

// Rectangles take the house radius `rounded-xs` (DESIGN.md §3). Matches the
// class words `rounded` and `rounded-{sm..3xl}` in string/template content;
// `rounded-xs`, `rounded-full`, `rounded-t-*` and friends do not match, and
// comments and identifiers are never Literals. Pinned by
// scripts/lib/radiusLint.test.mjs.
const radiusMessage =
  'Rectangles use rounded-xs (DESIGN.md §3); rounded-full is only for avatars, dots and spinners.';
const radiusSyntax = [
  {
    selector: 'Literal[value=/(^|\\s)rounded(-(sm|md|lg|xl|2xl|3xl))?(\\s|$)/]',
    message: radiusMessage,
  },
  {
    selector: 'TemplateElement[value.raw=/(^|\\s)rounded(-(sm|md|lg|xl|2xl|3xl))?(\\s|$)/]',
    message: radiusMessage,
  },
];
const withoutRadius = (list) => list.filter((r) => !radiusSyntax.includes(r));

// Numbers on screen follow the Number format setting, so they go through
// src/lib/numberLocale (createNumberFormat, formatNumber, formatCount), never a
// raw Intl.NumberFormat or toLocaleString (scope decision 20261020-113345).
// Syntax can't tell a Date from a number, so only `new Date(…).toLocaleString()`
// passes; another Date uses toLocaleDateString / toLocaleTimeString or
// src/lib/timestamp. Pinned by scripts/lib/numberFormatLint.test.mjs.
const numberFormatMessage =
  'Format numbers through src/lib/numberLocale (createNumberFormat, formatNumber) or formatCount / formatIsk, so they follow the Number format setting.';
const numberFormatSyntax = [
  {
    selector: "NewExpression[callee.object.name='Intl'][callee.property.name='NumberFormat']",
    message: numberFormatMessage,
  },
  {
    selector: "CallExpression[callee.object.name='Intl'][callee.property.name='NumberFormat']",
    message: numberFormatMessage,
  },
  {
    selector:
      "CallExpression[callee.property.name='toLocaleString']:not([callee.object.type='NewExpression'][callee.object.callee.name='Date'])",
    message: `${numberFormatMessage} A Date: toLocaleDateString / toLocaleTimeString or src/lib/timestamp.`,
  },
];
const withoutNumberFormat = (list) => list.filter((r) => !numberFormatSyntax.includes(r));

// Shared by every non-primitive file. Flat config replaces a rule's options
// rather than merging them, so a later block that adds selectors for a
// narrower glob must re-list these.
const restrictedSyntax = [
  ...rawInputSyntax,
  ...radiusSyntax,
  ...numberFormatSyntax,
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
    selector:
      "JSXOpeningElement[name.name='input'] > JSXAttribute[name.name='type'][value.value='range']",
    message: 'Use Slider from src/components/ui instead of a raw <input type="range">.',
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
  {
    // The theme defines no `surface-*` colour, so such a class renders nothing.
    selector: 'Literal[value=/(bg|text|border|ring|from|to)-surface-/]',
    message:
      'There is no `surface-*` colour in the theme — use a token from src/styles/index.css (panel, panel-2, line …).',
  },
  {
    selector: 'TemplateElement[value.raw=/(bg|text|border|ring|from|to)-surface-/]',
    message:
      'There is no `surface-*` colour in the theme — use a token from src/styles/index.css (panel, panel-2, line …).',
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

const linkArrowMessage =
  'A typed arrow (→ ↗ ›) must not end a link label; leaving the app is Icon.External, a row that goes elsewhere is a trailing CaretRight (DESIGN.md §6c).';

const sortArrowSyntax = [
  { selector: 'Literal[value=/[↑↓]/]', message: sortArrowMessage },
  { selector: 'TemplateElement[value.raw=/[↑↓]/]', message: sortArrowMessage },
  { selector: 'JSXText[value=/[↑↓]/]', message: sortArrowMessage },
  {
    selector:
      'JSXElement[openingElement.name.name=/^(Link|ExternalLink|a)$/] > JSXText:last-child[value=/[→↗›]\\s*$/]',
    message: linkArrowMessage,
  },
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
    // the load path (coalesce, reconcile, snapshot) touch the record
    // primitives directly.
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/components/ui/**',
      'src/features/miningTax/ledgerActions.ts',
      'src/features/miningTax/coalesce.ts',
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
              group: ['./assignments', '**/miningTax/assignments'],
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
    // Code that formats in a fixed shape, not the pilot's Number format: the
    // home of the number formatters, Date formatters, English K/M/B shorthand
    // (marks swapped by hand), chat text pasted into EVE (stays English, per
    // scope decision 20261020-113345), mockup fixtures, and Cloud Functions
    // (server code has no Number format setting). CSV and clipboard code
    // writes raw numbers or toFixed, so needs no entry.
    files: [
      'src/lib/numberLocale.ts',
      'src/lib/timestamp.ts',
      'src/lib/localDate.ts',
      'src/lib/compactNumber.ts',
      'src/engine/survey/chatMessage.ts',
      'src/mockups/**/*.ts',
      'functions/**/*.ts',
    ],
    rules: {
      'no-restricted-syntax': ['error', ...withoutNumberFormat(restrictedSyntax)],
    },
  },
  {
    files: ['src/**/*.test.tsx'],
    ignores: ['src/components/ui/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...withoutNumberFormat(withoutRadius(restrictedSyntax)).filter(
          (r) => !rawInputSyntax.includes(r)
        ),
        ...sortArrowSyntax,
      ],
    },
  },
  {
    // Stories are mockups: no house radius to keep, and their numbers are
    // sample data, not the pilot's.
    files: ['src/**/*.stories.tsx'],
    ignores: ['src/components/ui/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...withoutNumberFormat(withoutRadius(restrictedSyntax)),
        ...sortArrowSyntax,
      ],
    },
  },
  {
    // The Communities files still carry bare `rounded` on their chips; #4539
    // (surface-2) rewrites those lines and drops them from this list.
    files: [
      'src/features/communities/CommunityInvites.tsx',
      'src/features/communities/ShareFittingsTab.tsx',
      'src/features/communities/SharedBlueprintTable.tsx',
      'src/features/communities/CommunityLibrary.tsx',
      'src/features/bpcContracts/CommunityOfferCell.tsx',
    ],
    ignores: ['src/components/ui/**'],
    rules: {
      'no-restricted-syntax': ['error', ...withoutRadius(restrictedSyntax), ...sortArrowSyntax],
    },
  },
  {
    // Tests and e2e are fixtures: same reasons as stories.
    files: ['src/**/*.test.ts', 'e2e/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...withoutNumberFormat(withoutRadius(restrictedSyntax))],
    },
  },
  {
    files: ['src/components/ui/**/*.tsx'],
    ignores: [
      'src/components/ui/DataTable.tsx',
      'src/components/ui/DataTableSortPicker.tsx',
      'src/components/ui/DataTable.test.tsx',
    ],
    rules: {
      'no-restricted-syntax': ['error', ...sortArrowSyntax, ...numberFormatSyntax],
    },
  },
  {
    files: ['src/components/ui/**/*.test.tsx', 'src/components/ui/**/*.stories.tsx'],
    ignores: ['src/components/ui/DataTable.test.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...sortArrowSyntax],
    },
  },
  {
    // The sort-arrow exemption above is for the glyph only; the number rule
    // still reaches these, and the primitives' .ts modules.
    files: [
      'src/components/ui/DataTable.tsx',
      'src/components/ui/DataTableSortPicker.tsx',
      'src/components/ui/**/*.ts',
    ],
    ignores: ['src/components/ui/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...numberFormatSyntax],
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
  },
  {
    // A test harness exports its Harness component beside fixtures; it is never hot-reloaded.
    files: ['**/*.testutil.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  }
);
