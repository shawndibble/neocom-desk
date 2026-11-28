import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';

const eslint = new ESLint();

async function commentErrors(source, filePath = 'src/features/fixture.ts') {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.filter((m) => m.ruleId === 'local/no-comments');
}

describe('no-comments lint guard', () => {
  it.each([
    '// why\nexport const a = 1;\n',
    'export const a = 1; // why\n',
    '/* why */\nexport const a = 1;\n',
    '/** doc */\nexport const a = 1;\n',
    '/** prose @summary not first */\nexport const a = 1;\n',
    '// see eslint-disable-next-line\nexport const a = 1;\n',
    '/**\n * @summary The catalog line.\n * More.\n */\nexport const a = 1;\n',
  ])('fires on %j', async (source) => {
    expect(await commentErrors(source)).toHaveLength(1);
  });

  it('fires on a catalog summary outside src/components/ui', async () => {
    const summary = '/** @summary The catalog line. */\nexport const a = 1;\n';
    expect(await commentErrors(summary, 'src/features/fixture.ts')).toHaveLength(1);
    expect(await commentErrors(summary, 'functions/src/fixture.ts')).toHaveLength(1);
  });

  it('fires on a catalog summary longer than one line, even in a ui primitive', async () => {
    const summary = '/**\n * @summary The catalog line.\n * More.\n */\nexport const a = 1;\n';
    expect(await commentErrors(summary, 'src/components/ui/Fixture.tsx')).toHaveLength(1);
  });

  it.each([
    '// eslint-disable-next-line no-console\nconsole.log(1);\n',
    '// @ts-expect-error fixture\nexport const a: number = "x";\n',
    '// @vitest-environment jsdom\nexport const a = 1;\n',
    '/// <reference types="vite/client" />\nexport const a = 1;\n',
    '#!/usr/bin/env node\nexport const a = 1;\n',
    '// prettier-ignore\nexport const a = 1;\n',
    '/* eslint-disable no-console */\nconsole.log(1);\n',
  ])('allows the tool directive %j', async (source) => {
    expect(await commentErrors(source)).toHaveLength(0);
  });

  it.each([
    '/** @summary The catalog line. */\nexport const a = 1;\n',
    '/**\n * @summary The catalog line.\n */\nexport const a = 1;\n',
  ])('allows a one-line catalog summary in a ui primitive %j', async (source) => {
    expect(await commentErrors(source, 'src/components/ui/Fixture.tsx')).toHaveLength(0);
  });

  it('leaves a comment-free file alone', async () => {
    expect(await commentErrors('export const a = 1;\n')).toHaveLength(0);
  });
});
