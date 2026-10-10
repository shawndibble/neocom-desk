import { describe, it, expect } from 'vitest';
import en from './locales/en.json';

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

describe('en.json undo wording', () => {
  it('writes "can\'t be undone", never "cannot be undone"', () => {
    const all: [string, string][] = [];
    collectStrings(en, '', all);
    const bad = all.filter(([, value]) => /cannot be undone/i.test(value)).map(([path]) => path);
    expect(bad).toEqual([]);
  });
});
