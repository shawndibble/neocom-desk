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

describe('pointer-height scale', () => {
  it('has no off-scale md:min-h-8 / md:min-w-8 outside the shared control styles', () => {
    const offenders = ['src/features', 'src/routes']
      .flatMap((dir) => sourceFiles(dir))
      .filter((file) => /\bmd:min-(h|w)-8\b/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
