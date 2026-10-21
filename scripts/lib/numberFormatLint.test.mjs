import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';

/**
 * Pins the `no-restricted-syntax` selectors that keep raw number formatting
 * out of app code (issue #4594) — numbers on screen go through
 * src/lib/numberLocale so they follow the Number format setting. A selector
 * that never fires lints clean, so this runs the real config against fixtures.
 */
const eslint = new ESLint();

async function numberFormatErrors(source, filePath = 'src/features/fixture.tsx') {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.filter(
    (m) => m.ruleId === 'no-restricted-syntax' && m.message.includes('Number format setting')
  );
}

describe('number-format lint guard', () => {
  it.each([
    ['a bare number toLocaleString', 'export const f = (n: number) => n.toLocaleString();\n'],
    ['a locale toLocaleString', "export const f = (n: number) => n.toLocaleString('en-US');\n"],
    [
      'an optional-chained toLocaleString',
      'export const f = (n?: number) => n?.toLocaleString();\n',
    ],
    ['new Intl.NumberFormat', "export const f = new Intl.NumberFormat('en');\n"],
    ['Intl.NumberFormat called bare', "export const f = Intl.NumberFormat('en');\n"],
  ])('fires on %s', async (_, source) => {
    expect(await numberFormatErrors(source)).toHaveLength(1);
  });

  it.each([
    ['src/lib/fixture.ts'],
    ['src/components/ui/Fixture.tsx'],
    ['src/components/ui/fixture.ts'],
    ['src/components/ui/DataTable.tsx'],
  ])('fires in %s', async (filePath) => {
    const source = 'export const f = (n: number) => n.toLocaleString();\n';
    expect(await numberFormatErrors(source, filePath)).toHaveLength(1);
  });

  it.each([
    [
      'new Date(…).toLocaleString',
      'export const f = (t: number) => new Date(t).toLocaleString();\n',
    ],
    ['toLocaleDateString', 'export const f = (d: Date) => d.toLocaleDateString();\n'],
    ['an Intl.NumberFormatOptions type', 'export type O = Intl.NumberFormatOptions;\n'],
  ])('allows %s', async (_, source) => {
    expect(await numberFormatErrors(source)).toHaveLength(0);
  });

  it.each([
    ['src/lib/numberLocale.ts'],
    ['src/engine/survey/chatMessage.ts'],
    ['src/features/fixture.test.tsx'],
    ['src/features/fixture.test.ts'],
    ['src/features/Fixture.stories.tsx'],
    ['src/components/ui/Fixture.stories.tsx'],
    ['e2e/fixture.ts'],
    ['functions/src/fixture.ts'],
  ])('exempts %s', async (filePath) => {
    const source = "export const f = new Intl.NumberFormat('en');\n";
    const [result] = await eslint.lintText(source, { filePath });
    // A file ESLint ignores, or can't parse, reports a null ruleId: not an exemption.
    expect(result.messages.filter((m) => m.ruleId === null)).toEqual([]);
    expect(await numberFormatErrors(source, filePath)).toHaveLength(0);
  });

  it('keeps the shared selectors in an exempt file', async () => {
    const [result] = await eslint.lintText("export const c = 'bg-surface-2';\n", {
      filePath: 'src/lib/numberLocale.ts',
    });
    expect(result.messages.some((m) => m.message.includes('surface-*'))).toBe(true);
  });
});
