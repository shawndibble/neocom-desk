import { describe, it, expect } from 'vitest';
import en from './locales/en.json';

/** Doubles as an aria-label, so a trailing "…" would leak into the accessible name. */
const ALLOWED_BARE = ['settings.notifications.searchPlaceholder'];

/** Hold "..." as example fit text, not as a truncation mark. */
const EXAMPLE_TEXT = ['fittings.load.pastePlaceholder', 'skills.fitCheck.pastePlaceholder'];

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

/** Not labels that open a dialog: a field prompt, a truncation mark, an inline example. */
const NOT_DIALOG_LABELS = [
  'fittings.stats.unknownItemsMore_one',
  'fittings.stats.unknownItemsMore_other',
  'fittings.chargePicker.fightingAt',
  'fittings.implantFinder.searchLabel',
  'assets.movePlan.customOption',
  'miningTax.payees.moveToLabel',
  'corpTaxBook.moons.moonOwners.dialogs.settled.toggle',
];

const all: [string, string][] = [];
collectStrings(en, '', all);

describe('en.json ellipsis convention', () => {
  it('ends every "Search…" placeholder in a single U+2026', () => {
    const bad = all
      .filter(([path, value]) => path.endsWith('Placeholder') && value.startsWith('Search'))
      .filter(([path]) => !ALLOWED_BARE.includes(path))
      .filter(([, value]) => !value.endsWith('…'))
      .map(([path]) => path);
    expect(bad).toEqual([]);
  });

  it('never ends a string in three ASCII dots', () => {
    const bad = all
      .filter(([path, value]) => value.endsWith('...') && !EXAMPLE_TEXT.includes(path))
      .map(([path]) => path);
    expect(bad).toEqual([]);
  });

  it('puts no trailing "…" on a label that opens a dialog (DESIGN.md §6c)', () => {
    // What stays: placeholders, "Loading…"-style progress (a leading gerund, or a
    // key that says so), and the few prompts listed above.
    const progressKey = /placeholder|loading|pending|checking|resolving|searching|saving|ing$/i;
    const bad = all
      .filter(([, value]) => value.endsWith('…'))
      .filter(([path]) => !NOT_DIALOG_LABELS.includes(path))
      .filter(
        ([path, value]) =>
          !progressKey.test(path.split('.').pop() ?? '') && !/^(Search|[A-Z]\w*ing\b)/.test(value)
      )
      .map(([path, value]) => `${path}: ${value}`);
    expect(bad).toEqual([]);
  });
});
