import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';

/**
 * Pins the selector that keeps a typed trailing arrow ("→" "↗" "›") off link
 * labels (issue #3093). A regex selector that never fires lints clean, so this
 * runs the real config against fixtures.
 */
const eslint = new ESLint();

async function linkArrowErrors(source) {
  const [result] = await eslint.lintText(source, { filePath: 'src/features/fixture.tsx' });
  return result.messages.filter(
    (m) => m.ruleId === 'no-restricted-syntax' && m.message.includes('typed arrow')
  );
}

describe('link-label arrow lint guard', () => {
  it.each([
    ['a Link', 'export const X = ({ r }) => <Link to="/x">{r} →</Link>;\n'],
    [
      'an ExternalLink',
      'export const X = () => <ExternalLink href="/x">zKillboard ↗</ExternalLink>;\n',
    ],
    [
      'a multi-line Link',
      'export const X = ({ r }) => (\n  <Link to="/x">\n    {r} →\n  </Link>\n);\n',
    ],
    ['an anchor', 'export const X = () => <a href="/x">More ›</a>;\n'],
  ])('fires on a trailing arrow in %s', async (_, source) => {
    expect(await linkArrowErrors(source)).toHaveLength(1);
  });

  it('leaves "from → to" flows and non-links alone', async () => {
    const source =
      'export const X = ({ a, b }) => <><Link to="/x">{a} → {b}</Link><span>{a} →</span></>;\n';
    expect(await linkArrowErrors(source)).toHaveLength(0);
  });
});
