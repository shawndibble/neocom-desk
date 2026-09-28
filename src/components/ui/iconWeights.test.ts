import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALLOWED_ICON_WEIGHTS, ICON_WEIGHT, PHOSPHOR_WEIGHTS } from './iconWeights';

/**
 * Guard for `phosphorWeightsPlugin`: production builds strip every Phosphor
 * weight not in `ALLOWED_ICON_WEIGHTS`, so an icon asked to render one would
 * come out blank. `IconProps`' narrowed `weight` type catches most of that at
 * compile time; this catches the rest (a cast, an object literal, a context
 * provider) by scanning the source for weight names.
 */

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const WEIGHT_NAME = new RegExp(`['"\`](${PHOSPHOR_WEIGHTS.join('|')})['"\`]`, 'g');
const WEIGHT_VALUE = /\bweight\s*[=:]\s*(\{[^{}]*\}|[^,;}]+)/g;

describe('Phosphor icon weights', () => {
  it('the default weight is one the build keeps', () => {
    expect(ALLOWED_ICON_WEIGHTS).toContain(ICON_WEIGHT);
  });

  it('no source asks an icon for a weight the build strips', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      if (file.endsWith('iconWeights.ts')) continue;
      const source = readFileSync(file, 'utf8');
      // The value of a `weight=` / `weight:` — a whole `{…}` JSX expression or
      // everything up to the next `,`/`;`/`}` — even when it spans lines.
      for (const match of source.matchAll(WEIGHT_VALUE)) {
        const line = source.slice(0, match.index).split('\n').length;
        for (const [, weight] of match[1].matchAll(WEIGHT_NAME)) {
          if (!(ALLOWED_ICON_WEIGHTS as readonly string[]).includes(weight)) {
            offenders.push(`${relative(SRC, file)}:${line} uses '${weight}'`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('only icons.tsx imports Phosphor, so every icon goes through its narrowed weight type', () => {
    const importers = sourceFiles(SRC)
      .filter((file) => /from ['"]@phosphor-icons\//.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file).replace(/\\/g, '/'));
    expect(importers).toEqual(['components/ui/icons.tsx']);
  });
});
