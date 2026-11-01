import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';

/**
 * Pins the `no-restricted-syntax` selectors that keep numeric / rem-string
 * `size` literals off `Icon.*` glyphs (issue #5774). A regex selector that
 * never fires lints clean, so this runs the real config against fixtures.
 */
const eslint = new ESLint();

async function iconSizeErrors(source, filePath = 'src/features/fixture.tsx') {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.filter(
    (m) => m.ruleId === 'no-restricted-syntax' && m.message.includes('ICON_SIZE')
  );
}

describe('icon size lint guard', () => {
  it.each([
    ['a number', 'export const X = () => <Icon.Done size={12} />;\n'],
    ['a rem string', 'export const X = () => <Icon.Done size="0.75rem" />;\n'],
    ['a bare numeric string', 'export const X = () => <Icon.Done size="10" />;\n'],
  ])('fires on %s', async (_, source) => {
    expect(await iconSizeErrors(source)).toHaveLength(1);
  });

  it('applies to the primitives too', async () => {
    const errors = await iconSizeErrors(
      'export const X = () => <Icon.Back size={14} />;\n',
      'src/components/ui/Fixture.tsx'
    );
    expect(errors).toHaveLength(1);
  });

  it.each([
    ['100%', 'export const X = () => <Icon.Done size="100%" />;\n'],
    ['ICON_SIZE', 'export const X = () => <Icon.Done size={Icon.ICON_SIZE.sm} />;\n'],
    ['a className', 'export const X = () => <Icon.Done className="size-3" />;\n'],
  ])('allows %s', async (_, source) => {
    expect(await iconSizeErrors(source)).toHaveLength(0);
  });
});
