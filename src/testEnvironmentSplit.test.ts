import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `.test.ts` files run under `node`; only `*.dom.test.ts` gets jsdom (see
 * `DOM_TS_TESTS` in vite.config.ts), or a file that opts in with a
 * `// @vitest-environment jsdom` docblock. A plain `.test.ts` that mounts a
 * hook would otherwise fail with a confusing missing-`document` error, so name
 * the mistake here instead.
 */
const JSDOM_DOCBLOCK = /@vitest-environment\s+jsdom/;
const MOUNTS_INTO_DOM = /from ['"]@testing-library\/react['"]/;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

describe('test environment split', () => {
  it('keeps @testing-library/react out of node-environment .test.ts files', () => {
    const offenders = walk('src')
      .filter((path) => path.endsWith('.test.ts') && !path.endsWith('.dom.test.ts'))
      .map((path) => ({ path, source: readFileSync(path, 'utf-8') }))
      .filter(({ source }) => MOUNTS_INTO_DOM.test(source) && !JSDOM_DOCBLOCK.test(source))
      .map(({ path }) => path);
    expect(offenders, 'rename these to *.dom.test.ts or add a jsdom docblock').toEqual([]);
  });
});
