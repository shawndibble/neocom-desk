import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

export interface SourceFile {
  path: string;
  source: string;
}

const ROOT = join(__dirname, '..', '..');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

let cached: readonly SourceFile[] | undefined;

export function appSourceFiles(): readonly SourceFile[] {
  cached ??= walk(join(ROOT, 'src'))
    .filter((file) => /\.tsx?$/.test(file) && !/\.(test|stories)\.tsx?$/.test(file))
    .map((file) => ({
      path: relative(ROOT, file).split(sep).join('/'),
      source: readFileSync(file, 'utf8'),
    }));
  return cached;
}

export function ratchet(name: string, found: readonly string[], allowed: Iterable<string>): void {
  const allow = [...allowed];
  describe(name, () => {
    it('no new file', () => {
      expect(found.filter((file) => !allow.includes(file))).toEqual([]);
    });

    it('allowlist lists only current offenders', () => {
      expect(allow.filter((file) => !found.includes(file))).toEqual([]);
    });
  });
}
