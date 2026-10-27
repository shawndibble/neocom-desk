import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';

/**
 * Pins the `no-restricted-syntax` selectors that keep "↑" / "↓" text arrows
 * out of sort headers (issue #2532) — sort direction is always the
 * Icon.Sort / Icon.Ascending / Icon.Descending trio. A regex selector that
 * never fires lints clean, so this runs the real config against fixtures.
 */
const eslint = new ESLint();

async function sortArrowErrors(source, filePath = 'src/features/fixture.tsx') {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.filter(
    (m) => m.ruleId === 'no-restricted-syntax' && m.message.includes('Icon.Ascending')
  );
}

describe('sort-arrow lint guard', () => {
  it.each([
    ['a string literal', "export const X = ({ asc }) => <span>{asc ? '↑' : 'x'}</span>;\n"],
    ['a template literal', 'export const X = ({ c }) => <span>{`${c} ↓`}</span>;\n'],
    ['JSX text', 'export const X = () => <button type="button">Profit ↓</button>;\n'],
  ])('fires on an arrow in %s', async (_, source) => {
    expect(await sortArrowErrors(source)).toHaveLength(1);
  });

  it('applies to the primitives too', async () => {
    const errors = await sortArrowErrors(
      "export const X = () => <span>{'↑'}</span>;\n",
      'src/components/ui/Fixture.tsx'
    );
    expect(errors).toHaveLength(1);
  });

  it("exempts DataTable's native-<option> arrows", async () => {
    const errors = await sortArrowErrors(
      "export const SORT_ARROW = { asc: '↑', desc: '↓' };\n",
      'src/components/ui/DataTable.tsx'
    );
    expect(errors).toHaveLength(0);
  });

  it('keeps the shared selectors alongside it', async () => {
    const [result] = await eslint.lintText('export const X = () => <textarea />;\n', {
      filePath: 'src/features/fixture.tsx',
    });
    expect(result.messages.some((m) => m.message.includes('TextArea'))).toBe(true);
  });

  it('leaves comments alone', async () => {
    const errors = await sortArrowErrors('// reads "Price ↑"\nexport const X = 1;\n');
    expect(errors).toHaveLength(0);
  });
});
