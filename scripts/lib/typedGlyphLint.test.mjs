import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';

/**
 * Pins the `no-restricted-syntax` selector that keeps typed "−" / "+" / "Aa"
 * out of icon-only controls (issue #2278). esquery's regex attribute parsing
 * is easy to get silently wrong — a selector that never fires lints clean —
 * so this runs the real config against small fixtures.
 */
const eslint = new ESLint();

async function typedGlyphErrors(source, filePath = 'src/features/fixture.tsx') {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.filter(
    (m) => m.ruleId === 'no-restricted-syntax' && m.message.includes('IconButton')
  );
}

describe('typed-glyph lint guard', () => {
  it.each(['−', '+', 'Aa', '  +  '])('fires on a control whose only text is %j', async (glyph) => {
    const errors = await typedGlyphErrors(
      `export const X = () => <button type="button">${glyph}</button>;\n`
    );
    expect(errors).toHaveLength(1);
  });

  it('fires on a glyph on its own line inside JSX', async () => {
    const errors = await typedGlyphErrors(
      'export const X = () => (\n  <button type="button">\n    −\n  </button>\n);\n'
    );
    expect(errors).toHaveLength(1);
  });

  it.each(['+ Add', 'Aardvark', '1 + 2', 'Fit'])('leaves real text like %j alone', async (text) => {
    const errors = await typedGlyphErrors(
      `export const X = () => <button type="button">${text}</button>;\n`
    );
    expect(errors).toHaveLength(0);
  });

  it('leaves a sign before an amount alone', async () => {
    const errors = await typedGlyphErrors(
      'export const X = ({ v }) => <span>+<b>{v}</b></span>;\n'
    );
    expect(errors).toHaveLength(0);
  });

  it('does not apply inside the primitives', async () => {
    const errors = await typedGlyphErrors(
      'export const X = () => <button type="button">+</button>;\n',
      'src/components/ui/Fixture.tsx'
    );
    expect(errors).toHaveLength(0);
  });
});
