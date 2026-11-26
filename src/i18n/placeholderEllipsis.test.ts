import { describe, it, expect } from 'vitest';
import en from './locales/en.json';

const ALLOWED_BARE = ['settings.notifications.searchPlaceholder'];

const EXAMPLE_TEXT = ['fittings.load.pastePlaceholder'];

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
