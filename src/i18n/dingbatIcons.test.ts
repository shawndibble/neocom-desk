import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, it, expect } from 'vitest';
import en from './locales/en.json';

/** DESIGN.md §5: a typed dingbat is never an icon — use an `Icon.*` glyph. */
const DINGBATS = /[●▲⇉⤳]/;

/** Travel's bridge/wormhole markers still need their own glyph aliases; the follow-up removes this. */
const ALLOWED = ['src/features/travel/'];

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx') && !p.endsWith('.test.tsx')) out.push(p.split(sep).join('/'));
  }
}

function collectStrings(node: unknown, path: string, out: [string, string][]) {
  if (typeof node === 'string') out.push([path, node]);
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) collectStrings(v, path ? `${path}.${k}` : k, out);
  }
}

describe('typed dingbats', () => {
  it('feature components never type ● ▲ ⇉ ⤳ (Planetary Industry is being overhauled)', () => {
    const files: string[] = [];
    walk('src/features', files);
    const bad = files
      .filter((f) => !f.startsWith('src/features/pi/') && !ALLOWED.some((a) => f.startsWith(a)))
      .filter((f) => DINGBATS.test(readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });

  it('en.json strings never carry a typed ✓ (outside Planetary Industry)', () => {
    const all: [string, string][] = [];
    collectStrings(en, '', all);
    const bad = all
      .filter(([p, v]) => v.includes('✓') && !p.startsWith('piColonies.'))
      .map(([p]) => p);
    expect(bad).toEqual([]);
  });
});
