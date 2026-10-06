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
    // A sanity floor: the collector must still find the surviving menus (many were deleted
    // by the §6c restraint rules, so this is a floor, not a count).
    expect(entries.length).toBeGreaterThan(10);
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

function collectStrings(node: unknown, path: string, out: string[][]) {
  if (typeof node === 'string') {
    out.push([path, node]);
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) collectStrings(value, `${path}.${key}`, out);
  }
}

describe('Market page-name casing', () => {
  const all: string[][] = [];
  collectStrings(en, 'en', all);

  it('never spells the Market page as lowercase "in market"', () => {
    const offenders = all.filter(([, value]) => /\bin market\b/.test(value));
    expect(offenders).toEqual([]);
  });
});
