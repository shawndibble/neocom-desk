import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import testingLibrary from 'eslint-plugin-testing-library';
import { noComments } from './scripts/lib/noCommentsRule.mjs';

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

const iconSizeMessage =
  'Size a glyph with Icon.ICON_SIZE.*, or className="size-3" for a chip glyph below sm — not a numeric/rem `size` literal (DESIGN.md §5).';
const iconSizeSyntax = [
  {
    selector:
      "JSXOpeningElement[name.object.name='Icon'] > JSXAttribute[name.name='size'] > Literal[raw=/^[\"']?[0-9.]+(rem|px)?[\"']?$/]",
    message: iconSizeMessage,
  },
  {
    selector:
      "JSXOpeningElement[name.object.name='Icon'] > JSXAttribute[name.name='size'] > JSXExpressionContainer > Literal[raw=/^[\"']?[0-9.]+(rem|px)?[\"']?$/]",
    message: iconSizeMessage,
  },
];

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
    selector: 'JSXText[value=/^\\s*(−|\\+|Aa)\\s*$/]:first-child:last-child',
    message:
      'A typed "−", "+" or "Aa" is not an icon — use IconButton with an Icon.* glyph (e.g. Icon.Decrease / Icon.Increase).',
  },
  {
    selector: 'Literal[value=/(bg|text|border|ring|from|to)-surface-/]',
    message:
      'There is no `surface-*` colour in the theme — use a token from src/styles/index.css (panel, panel-2, line …).',
  },
  {
    selector: 'TemplateElement[value.raw=/(bg|text|border|ring|from|to)-surface-/]',
    message:
      'There is no `surface-*` colour in the theme — use a token from src/styles/index.css (panel, panel-2, line …).',
  },
  ...iconSizeSyntax,
];

const sortArrowMessage =
  'Draw sort direction with Icon.Sort / Icon.Ascending / Icon.Descending, not a "↑" / "↓" character (DESIGN.md §5).';
const improveDeepImportPattern = {
  group: ['**/improve/*'],
  message: "Import the Improve engine from '@/engine/fittings/improve', not a file inside it.",
};
const restrictedImportPaths = [
  {
    name: 'radix-ui',
    message: 'Import Radix primitives through src/components/ui, not directly.',
  },
  {
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

const sleepMessage =
  'A test waits for a signal, never a duration: findBy*/waitFor on the outcome, or fake timers when the code is timer-driven (docs/agents/testing-and-ci.md).';
const sleepPromise =
  "NewExpression[callee.name='Promise']:has(CallExpression[callee.name='setTimeout'], CallExpression[callee.property.name='setTimeout'])";
const testFlowCall =
  'CallExpression:not([callee.name=/^(it|test|beforeEach|afterEach|beforeAll|afterAll|describe|act|waitFor)$/]):not([callee.object.name=/^(it|test|describe)$/]):not([callee.callee.object.name=/^(it|test|describe)$/])';
const sleepSyntax = [
  {
    selector: `AwaitExpression:not(${testFlowCall} > :function AwaitExpression):not(${testFlowCall} > TSAsExpression > :function AwaitExpression):not(Property > :function AwaitExpression):not(:function > :function AwaitExpression) > ${sleepPromise}`,
    message: sleepMessage,
  },
  {
    selector: `:matches(VariableDeclarator > ArrowFunctionExpression, VariableDeclarator > ArrowFunctionExpression > BlockStatement > ReturnStatement, Program > FunctionDeclaration > BlockStatement > ReturnStatement) > ${sleepPromise}`,
    message: sleepMessage,
  },
];

const concurrentSyntax = [
  {
    selector:
      "MemberExpression[object.name=/^(it|test|describe)$/][property.name='concurrent'], MemberExpression[object.object.name=/^(it|test|describe)$/][property.name='concurrent']",
    message:
      'No .concurrent tests: src/test/teardown.ts tracks one running test per file (its fetch phase and abort controller are module state).',
  },
];

const testingLibraryRules = Object.fromEntries(
  [
    'await-async-queries',
    'await-async-utils',
    'await-async-events',
    'no-wait-for-side-effects',
    'no-wait-for-multiple-assertions',
    'prefer-find-by',
    'no-unnecessary-act',
    'no-await-sync-queries',
    'prefer-presence-queries',
  ].map((rule) => [`testing-library/${rule}`, 'error'])
);

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dev-dist',
      'coverage',
      'playwright-report',
      'test-results',
      '.claude/worktrees',
      '.cache',
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
      'no-empty': ['error', { allowEmptyCatch: true }],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['src/components/ui/**'],
    rules: {
      'no-restricted-syntax': ['error', ...restrictedSyntax],
      'no-restricted-imports': [
        'error',
        { paths: restrictedImportPaths, patterns: [improveDeepImportPattern] },
      ],
    },
  },
  {
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
            improveDeepImportPattern,
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
        ...sleepSyntax,
        ...concurrentSyntax,
      ],
    },
  },
  {
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
    files: ['src/**/*.test.ts', 'e2e/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...withoutNumberFormat(withoutRadius(restrictedSyntax)),
        ...sleepSyntax,
        ...concurrentSyntax,
      ],
    },
  },
  {
    files: ['src/test/**/*.ts'],
    ignores: ['src/test/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...restrictedSyntax, ...sleepSyntax],
    },
  },
  {
    files: ['src/test/**/*.tsx'],
    ignores: ['src/test/**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...restrictedSyntax, ...sortArrowSyntax, ...sleepSyntax],
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
      'no-restricted-syntax': [
        'error',
        ...sortArrowSyntax,
        ...numberFormatSyntax,
        ...iconSizeSyntax,
      ],
    },
  },
  {
    files: ['src/components/ui/**/*.stories.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...sortArrowSyntax, ...iconSizeSyntax],
    },
  },
  {
    files: ['src/components/ui/**/*.test.tsx'],
    ignores: ['src/components/ui/DataTable.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...sortArrowSyntax,
        ...iconSizeSyntax,
        ...sleepSyntax,
        ...concurrentSyntax,
      ],
    },
  },
  {
    files: ['src/components/ui/DataTable.test.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...sleepSyntax, ...concurrentSyntax],
    },
  },
  {
    files: [
      'src/components/ui/DataTable.tsx',
      'src/components/ui/DataTableSortPicker.tsx',
      'src/components/ui/**/*.ts',
    ],
    ignores: ['src/components/ui/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...numberFormatSyntax, ...iconSizeSyntax],
    },
  },
  {
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
    files: ['**/*.testutil.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['src/**/*.test.tsx', 'src/**/*.dom.test.ts'],
    plugins: { 'testing-library': testingLibrary },
    rules: testingLibraryRules,
  },
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    plugins: { local: { rules: { 'no-comments': noComments } } },
    rules: { 'local/no-comments': 'error' },
  },
  {
    files: ['e2e/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          property: 'waitForTimeout',
          message:
            'Wait for a signal, never a duration: a web-first expect (toBeVisible, toHaveText …), expect.poll or page.waitForResponse.',
        },
      ],
    },
  }
);
