import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from './locales/en.json';

/** Every `t('a.b.c')` with a literal key in `src` must resolve in en.json (issue #3253). */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Already missing when this guard landed; each belongs to its own fix (PI pages are mid-overhaul). Shrink, never grow. */
const KNOWN_MISSING = new Set([
  'settings.notifications.installRequiredLink',
  'piPlan.find.whatIfChip',
  'piPlan.make.failedTitle',
  'piPlan.make.failedHint',
]);

const PLURAL = /_(zero|one|two|few|many|other)$/;

function resolves(key: string): boolean {
  const flat = key.split('.').reduce<unknown>((node, part) => {
    return node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined;
  }, en);
  if (flat !== undefined) return true;
  const parts = key.split('.');
  const parent = parts
    .slice(0, -1)
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      en
    ) as Record<string, unknown> | undefined;
  const last = parts[parts.length - 1];
  return !!parent && Object.keys(parent).some((k) => k.replace(PLURAL, '') === last);
}

describe('literal translation keys', () => {
  it('all exist in en.json', () => {
    const missing: string[] = [];
    for (const file of sourceFiles(join(__dirname, '..'))) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/\bt\(\s*'([a-zA-Z][\w-]*(?:\.[\w-]+)+)'/g)) {
        if (!KNOWN_MISSING.has(match[1]) && !resolves(match[1]))
          missing.push(`${match[1]} (${file})`);
      }
    }
    expect(missing).toEqual([]);
  });
});
