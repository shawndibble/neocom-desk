import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { iconButtonClassName } from './iconButtonClassName';
import { menuItemClassName } from './menuStyles';
import {
  controlHeightClassName,
  gripHitAreaClassName,
  tappableRowClassName,
  touchHitAreaClassName,
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

describe('touch tier', () => {
  it('keeps the touch height on a coarse pointer above md, and the pointer height otherwise', () => {
    expect(controlHeightClassName.sm).toBe('h-9 md:h-7 touch:h-9');
    expect(controlHeightClassName.md).toBe('h-11 md:h-9 touch:h-11');
    expect(tappableRowClassName).toBe('min-h-11 md:min-h-7 touch:min-h-11');
  });

  it('puts `touch:` after `md:` in every sized class, so it wins above md', () => {
    for (const size of ['md', 'sm', 'row'] as const) {
      const classes = iconButtonClassName({ size }).split(' ');
      const md = classes.findIndex((c) => c.startsWith('md:size-'));
      const touch = classes.findIndex((c) => c.startsWith('touch:size-'));
      expect(md).toBeGreaterThan(-1);
      expect(touch).toBeGreaterThan(md);
    }
    expect(iconButtonClassName({ size: 'md' })).toContain('touch:size-11');
    expect(iconButtonClassName({ size: 'row' })).toContain('touch:size-11');
    expect(iconButtonClassName({ size: 'sm' })).toContain('touch:size-9');
  });

  it('gives menu items a 44px target on touch', () => {
    expect(menuItemClassName).toContain('touch:min-h-11');
  });

  it('gives checkboxes and grips a padded pseudo-element, not a layout change', () => {
    expect(touchHitAreaClassName).toContain('touch:before:-inset-3.5');
    expect(gripHitAreaClassName).toContain('touch:before:size-11');
    expect(`${touchHitAreaClassName} ${gripHitAreaClassName}`).not.toMatch(/(^| )(p|m|size|h|w)-/);
  });

  it('declares the touch variant against a coarse pointer', () => {
    const css = readFileSync('src/styles/index.css', 'utf8');
    expect(css).toContain('@custom-variant touch (@media (pointer: coarse));');
  });

  it('has no long-press tooltip override left in app source', () => {
    const offenders = ['src']
      .flatMap((dir) => sourceFiles(dir))
      .filter((file) =>
        /holdToReveal|revealOn="longPress"|'longPress'/.test(readFileSync(file, 'utf8'))
      );
    expect(offenders).toEqual([]);
  });
});
