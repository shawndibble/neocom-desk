import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';

/**
 * Pins the `no-restricted-syntax` selectors that keep rectangles on the house
 * `rounded-xs` radius (DESIGN.md §3, issue #4540). A regex selector that never
 * fires lints clean, so this runs the real config against fixtures.
 */
const eslint = new ESLint();

async function radiusErrors(source, filePath = 'src/features/fixture.tsx') {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.filter(
    (m) => m.ruleId === 'no-restricted-syntax' && m.message.includes('rounded-xs')
  );
}

describe('rectangle radius lint guard', () => {
  it.each([
    ['bare rounded', 'rounded border'],
    ['rounded-sm', 'flex rounded-sm border'],
    ['rounded-md', 'rounded-md'],
    ['rounded-xl', 'a rounded-xl b'],
    ['rounded-3xl', 'rounded-3xl p-2'],
  ])('fires on %s in a string literal', async (_, cls) => {
    const source = `export const X = () => <div className="${cls}" />;\n`;
    expect(await radiusErrors(source)).toHaveLength(1);
  });

  it('fires inside a template literal', async () => {
    const source = 'export const X = ({ c }) => <div className={`${c} rounded-md border`} />;\n';
    expect(await radiusErrors(source)).toHaveLength(1);
  });

  it.each(['rounded-xs', 'rounded-full', 'rounded-t-md', 'rounded-r-none', 'rounded-none'])(
    'allows %s',
    async (cls) => {
      const source = `export const X = () => <div className="p-1 ${cls} border" />;\n`;
      expect(await radiusErrors(source)).toHaveLength(0);
    }
  );

  it('ignores identifiers and comments', async () => {
    const source =
      '// the figure is rounded as shown\nexport const f = (v: number) => {\n  const rounded = Math.round(v);\n  return rounded;\n};\n';
    expect(await radiusErrors(source, 'src/features/fixture.ts')).toHaveLength(0);
  });

  it('exempts stories and tests', async () => {
    const source = 'export const X = () => <div className="rounded-md" />;\n';
    expect(await radiusErrors(source, 'src/features/Fixture.stories.tsx')).toHaveLength(0);
    expect(await radiusErrors(source, 'src/features/Fixture.test.tsx')).toHaveLength(0);
  });
});
