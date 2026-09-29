import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toggleChipStateClassName } from './controlStyles';

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

describe('toggleChipStateClassName', () => {
  it('gives an on chip the accent tint: dim accent edge, 15% fill, accent text', () => {
    expect(toggleChipStateClassName(true)).toBe('border-accent-dim bg-accent/15 text-accent');
  });

  it('gives an off chip the input fill, dim text and a line-bright hover', () => {
    expect(toggleChipStateClassName(false)).toBe(
      'border-line bg-panel-2 text-text-dim hover:border-line-bright hover:text-text'
    );
  });

  it('drops the hover from an off chip that cannot be toggled', () => {
    expect(toggleChipStateClassName(false, { hoverable: false })).toBe(
      'border-line bg-panel-2 text-text-dim'
    );
  });
});
