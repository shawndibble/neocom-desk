import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  disabledClassName,
  focusRingClassName,
  focusRingInsetClassName,
  interactiveClassName,
  toggleChipStateClassName,
} from './controlStyles';

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
    expect(toggleChipStateClassName(true)).toBe(
      'border-accent-dim bg-accent/15 text-accent hover:bg-accent/22 active:bg-accent/28'
    );
  });

  it('gives an off chip the input fill, dim text and a line-bright hover', () => {
    expect(toggleChipStateClassName(false)).toBe(
      'border-line bg-panel-2 text-text-dim hover:border-line-bright hover:text-text active:bg-panel'
    );
  });

  it('drops the hover from an on chip that cannot be toggled', () => {
    expect(toggleChipStateClassName(true, { hoverable: false })).toBe(
      'border-accent-dim bg-accent/15 text-accent'
    );
  });

  it('drops the hover from an off chip that cannot be toggled', () => {
    expect(toggleChipStateClassName(false, { hoverable: false })).toBe(
      'border-line bg-panel-2 text-text-dim'
    );
  });
});

describe('shared interaction recipe (DESIGN.md §6c)', () => {
  it('transitions colour properties only, at 120ms, snapping in at 40ms, never under reduced motion', () => {
    expect(interactiveClassName).toContain('duration-120');
    expect(interactiveClassName).toContain('active:duration-40');
    expect(interactiveClassName).toContain('motion-reduce:transition-none');
    expect(interactiveClassName).not.toMatch(/transition-(all|transform)/);
  });

  it('draws a 2px accent ring, outset or inset', () => {
    expect(focusRingClassName).toContain('focus-visible:outline-offset-2');
    expect(focusRingInsetClassName).toContain('focus-visible:-outline-offset-2');
  });

  it('dims a disabled control by attribute or by aria-disabled', () => {
    for (const token of [
      'disabled:opacity-40',
      'disabled:cursor-not-allowed',
      'aria-disabled:opacity-40',
      'aria-disabled:cursor-not-allowed',
    ]) {
      expect(disabledClassName.split(' ')).toContain(token);
    }
  });
});

describe('primitives compose the shared recipe', () => {
  it('has no ad-hoc transition-colors or press scale, and no pointer-events-none on a button', () => {
    // Layout.tsx keeps one ad-hoc transition-colors (its own chrome, outside the primitives).
    const adHoc = sourceFiles('src')
      .filter((file) => !file.endsWith('Layout.tsx'))
      .filter((file) => !file.endsWith('controlStyles.test.ts'))
      .filter((file) =>
        new RegExp('transition-colors|active:' + 'scale').test(readFileSync(file, 'utf8'))
      );
    expect(adHoc).toEqual([]);
    expect(readFileSync('src/components/ui/buttonClassName.ts', 'utf8')).not.toContain(
      'pointer-events-none'
    );
  });
});
