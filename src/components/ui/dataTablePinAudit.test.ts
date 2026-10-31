import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every `responsive="table"` DataTable scrolls sideways on a phone, so its
// identifying column must be pinned (`stickyStart`) or the row loses its name.

const ROOT = resolve(__dirname, '../../..');
const SRC = join(ROOT, 'src');

// Files that legitimately pin without `stickyStart`.
const ALLOWLIST: Record<string, string> = {
  // Pins its attribute column with hand-rolled `sticky left-0` classes shared
  // with a custom header and a fixed matrix width, so the column prop can't be used.
  'src/features/market/CompareAttributesMatrix.tsx': 'hand-rolled sticky attribute column',
};

// Columns passed in as props from a hook the file doesn't import.
const EXTRA_COLUMN_SOURCES: Record<string, string[]> = {};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.(test|stories)\./.test(name)) out.push(full);
  }
  return out;
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : resolve(dirname(from), spec);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function pins(file: string): boolean {
  const source = readFileSync(file, 'utf8');
  if (source.includes('stickyStart')) return true;
  const specs = [...source.matchAll(/from '((?:\.{1,2}\/|@\/)[^']+)'/g)].map((m) => m[1]);
  return specs.some((spec) => {
    const target = resolveImport(file, spec);
    return target !== null && readFileSync(target, 'utf8').includes('stickyStart');
  });
}

const tableFiles = walk(SRC)
  .filter((f) => !f.startsWith(join(SRC, 'components/ui')))
  .filter((f) => readFileSync(f, 'utf8').includes('responsive="table"'))
  .map((f) => relative(ROOT, f));

describe('responsive="table" pins its identifying column', () => {
  it('finds the call sites', () => {
    expect(tableFiles.length).toBeGreaterThan(20);
  });

  it.each(tableFiles)('%s', (path) => {
    if (path in ALLOWLIST) return;
    const files = [path, ...(EXTRA_COLUMN_SOURCES[path] ?? [])].map((p) => join(ROOT, p));
    expect(files.some(pins), `${path} has no stickyStart column`).toBe(true);
  });
});
