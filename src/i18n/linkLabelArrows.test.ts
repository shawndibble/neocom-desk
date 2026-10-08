import { describe, it, expect } from 'vitest';
import en from './locales/en.json';

/** DESIGN.md §6c Cue vocabulary: no typed arrow ends a link label. */
const TRAILING_ARROW = /[→↗›]\s*$/;

/** Bare between-items separators, not link labels. */
const SEPARATORS = ['travel.stops.orderSeparator'];

function collectStrings(node: unknown, path: string, out: [string, string][]) {
  if (typeof node === 'string') {
    out.push([path, node]);
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      collectStrings(value, path ? `${path}.${key}` : key, out);
    }
  }
}

describe('en.json link labels', () => {
  it('never ends a string in a typed arrow (→ ↗ ›)', () => {
    const all: [string, string][] = [];
    collectStrings(en, '', all);
    const bad = all
      .filter(([path, value]) => TRAILING_ARROW.test(value.trim()) && !SEPARATORS.includes(path))
      .map(([path]) => path);
    expect(bad).toEqual([]);
  });
});
