import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { textActionClassName } from './textActionClassName';

describe('textActionClassName', () => {
  it('carries the uppercase accent recipe with the touch box', () => {
    const tokens = textActionClassName().split(' ');
    for (const token of [
      'min-h-11',
      'md:min-h-0',
      'font-semibold',
      'tracking-widest',
      'text-accent',
      'uppercase',
      'hover:underline',
      'focus-visible:outline-accent',
    ]) {
      expect(tokens).toContain(token);
    }
  });

  it('appends per-site extras', () => {
    expect(
      textActionClassName('gap-1 whitespace-nowrap').endsWith(' gap-1 whitespace-nowrap')
    ).toBe(true);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('hand-rolled uppercase accent text actions', () => {
  it('none exist outside the helper', () => {
    const offenders = ['src/features', 'src/routes', 'src/components']
      .flatMap((dir) => sourceFiles(dir))
      .filter((file) => !file.endsWith('textActionClassName.ts'))
      .filter((file) =>
        (readFileSync(file, 'utf8').match(/(['"`])(?:(?!\1)[^\n])*\1/g) ?? []).some(
          (str) =>
            /(^|[\s'"`])text-accent([\s'"`]|$)/.test(str) &&
            /(^|[\s'"`])uppercase([\s'"`]|$)/.test(str) &&
            /(^|[\s'"`])hover:underline([\s'"`]|$)/.test(str)
        )
      );
    expect(offenders).toEqual([]);
  });
});
