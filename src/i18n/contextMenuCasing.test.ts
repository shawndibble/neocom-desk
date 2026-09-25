import { describe, it, expect } from 'vitest';
import en from './locales/en.json';

/** Proper feature names / acronyms that stay capitalised mid-label. */
const ALLOWED_PHRASES = [
  'Compare Variations',
  'Build Plan',
  'Skill Plan',
  'PI Plan',
  'Market',
  'Quickbar',
  'Compare',
  'Industry',
  'PI',
  'EFT',
  'ID',
];

function collectContextMenuStrings(node: unknown, inMenu: boolean, path: string, out: string[][]) {
  if (typeof node === 'string') {
    if (inMenu) out.push([path, node]);
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      collectContextMenuStrings(value, inMenu || key === 'contextMenu', `${path}.${key}`, out);
    }
  }
}

describe('context-menu label casing', () => {
  const entries: string[][] = [];
  collectContextMenuStrings(en, false, 'en', entries);

  it('finds the context-menu strings', () => {
    expect(entries.length).toBeGreaterThan(20);
  });

  it.each(entries)('%s ("%s") is sentence case', (_path, label) => {
    let rest = label;
    for (const phrase of ALLOWED_PHRASES) {
      rest = rest.replace(new RegExp(String.raw`\b${phrase}\b`, 'g'), 'x');
    }
    // The first word may be capitalised; every later word must not be.
    for (const word of rest.split(/\s+/).slice(1)) {
      expect(word, `"${word}" in "${label}"`).not.toMatch(/^[A-Z]/);
    }
  });
});
