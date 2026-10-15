import { describe, it, expect } from 'vitest';
import en from './locales/en.json';

/** The glossary term is Skill Plan; the Communities tab label is the one sentence-case exception. */
const HYBRID = /Skill plans?/;

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

describe('en.json Communities Skill Plan casing', () => {
  it('writes "Skill Plan(s)" everywhere under communities except the tab label', () => {
    const all: [string, string][] = [];
    collectStrings(en.communities, 'communities', all);
    const bad = all
      .filter(([path, value]) => path !== 'communities.tabs.plans' && HYBRID.test(value))
      .map(([path]) => path);
    expect(bad).toEqual([]);
  });
});
