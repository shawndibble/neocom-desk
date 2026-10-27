import { describe, it, expect } from 'vitest';
import en from './locales/en.json';

/** The app says "log in" / "login" / "logged-in" everywhere; "sign in" is a second name for the same EVE SSO action. */
const SIGN_IN = /\bsign(ed)?[- ]?in\b|\bsigning in\b/i;

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

describe('en.json login wording', () => {
  it('never says "sign in" for the EVE SSO action', () => {
    const all: [string, string][] = [];
    collectStrings(en, '', all);
    const bad = all.filter(([, value]) => SIGN_IN.test(value)).map(([path]) => path);
    expect(bad).toEqual([]);
  });
});
