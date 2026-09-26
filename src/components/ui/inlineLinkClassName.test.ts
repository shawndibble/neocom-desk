import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const hasToken = (str: string, token: string) =>
  new RegExp(`(^|[\\s'"\`])${token}([\\s'"\`]|$)`).test(str);

describe('hand-rolled in-sentence accent links', () => {
  it('none exist outside controlStyles', () => {
    const offenders = ['src/features', 'src/routes', 'src/components']
      .flatMap((dir) => sourceFiles(dir))
      .filter((file) => !file.endsWith('controlStyles.ts'))
      .filter((file) =>
        (readFileSync(file, 'utf8').match(/(['"`])(?:(?!\1)[^\n])*\1/g) ?? []).some(
          (str) => hasToken(str, 'text-accent') && hasToken(str, 'underline')
        )
      );
    expect(offenders).toEqual([]);
  });
});
