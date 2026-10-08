import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en.json';
import type { AppraisalCatalogue } from '@/engine/market/appraisalMatch';
import {
  detectPasteDestination,
  PASTE_DETECTORS,
  pasteDestination,
  type PasteDetector,
} from '@/engine/import/pasteDestination';

const CATALOGUE: AppraisalCatalogue = new Map(
  ['Rifter', 'Damage Control II', 'Tritanium', 'Pyerite', 'Nocxium', 'Warp Disruptor II'].map(
    (name, index) => [name.toLowerCase(), { typeId: index + 1, name }]
  )
);

const HULLS: ReadonlySet<string> = new Set(['rifter']);
const SOURCES = { catalogue: CATALOGUE, hullNames: HULLS };

const FIT = ['[Rifter, Kite Fit]', '', 'Damage Control II', '', 'Warp Disruptor II'].join('\n');

describe('pasteDestination', () => {
  it('sends an EFT fit of a known hull to Fittings', () => {
    expect(pasteDestination(FIT, SOURCES)).toBe('fitting');
  });

  it('accepts a bare "[Ship]" header with no fit name', () => {
    expect(pasteDestination('[Rifter]\n\nDamage Control II', SOURCES)).toBe('fitting');
  });

  it('ignores a bracketed line whose hull is not a real item', () => {
    expect(pasteDestination('[citation needed]\nsome prose', SOURCES)).toBeNull();
  });

  it('ignores a bracketed header naming an item that is not a hull', () => {
    expect(pasteDestination('[Tritanium]\n\nDamage Control II', SOURCES)).toBeNull();
  });

  it('ignores a malformed EFT header rather than appraising it', () => {
    expect(pasteDestination('[ , Max Hacker]\n\nDamage Control II', SOURCES)).toBeNull();
  });

  it('sends an inventory copy to the Appraisal', () => {
    expect(pasteDestination('Tritanium\t124,500\nPyerite\t2,000', SOURCES)).toBe('appraisal');
  });

  it('sends a multibuy list to the Appraisal', () => {
    expect(pasteDestination('Damage Control II x2\nWarp Disruptor II x4', SOURCES)).toBe(
      'appraisal'
    );
  });

  it('sends a lone item name to the Appraisal', () => {
    expect(pasteDestination('Tritanium', SOURCES)).toBe('appraisal');
  });

  it('still appraises when a minority of lines are unknown', () => {
    expect(pasteDestination('Tritanium 10\nPyerite 20\nMystery Box 1', SOURCES)).toBe('appraisal');
  });

  it('ignores text where most lines are not items', () => {
    expect(
      pasteDestination('Tritanium\nhello there!\nsee you in local, o7\no7?', SOURCES)
    ).toBeNull();
  });

  it('sends two or more pilot names to Pilot Lookup', () => {
    expect(pasteDestination('Alpha One\nBeta Two\nGamma Three', SOURCES)).toBe('pilotList');
  });

  it('sends an in-game chat link to its page', () => {
    expect(pasteDestination('<url=showinfo:587>Rifter</url>', SOURCES)).toBe('chatLink');
    expect(pasteDestination('<url=showinfo:5//30000142>Jita</url>', SOURCES)).toBe('chatLink');
  });

  it('leaves an unsupported chat link alone', () => {
    expect(pasteDestination('<url=showinfo:2//98000001>Corp</url>', SOURCES)).toBeNull();
  });

  it('sends a D-Scan to Pilot Lookup', () => {
    expect(pasteDestination('626\tMy Vexor\tVexor\t1 km\n626\tB\tVexor\t2 km', SOURCES)).toBe(
      'dscan'
    );
  });

  it('still opens Pilot Lookup when a name list holds one item-like name', () => {
    expect(pasteDestination('Alpha One\nTritanium\nBeta Two\nGamma Three', SOURCES)).toBe(
      'pilotList'
    );
    expect(pasteDestination('Tritanium\nAlpha One', SOURCES)).toBe('pilotList');
  });

  it('keeps an item list with one unknown line in the Appraisal, not Pilot Lookup', () => {
    expect(pasteDestination('Tritanium\nPyerite\nNocxium\nMystery Box', SOURCES)).toBe('appraisal');
  });

  it('never appraises a D-Scan, even one whose names are real items', () => {
    expect(
      pasteDestination('1\tTritanium\tTritanium\t1 km\n2\tPyerite\tPyerite\t2 km', SOURCES)
    ).toBe('dscan');
  });

  it('leaves a malformed scan alone', () => {
    expect(
      pasteDestination('626\tMy Vexor\tVexor\t1 km\nsee you in local, o7?', SOURCES)
    ).toBeNull();
  });

  it('leaves a single name alone', () => {
    expect(pasteDestination('Alpha One', SOURCES)).toBeNull();
  });

  it('ignores prose and links', () => {
    expect(pasteDestination('Tritanium is cheap today', SOURCES)).toBeNull();
    expect(pasteDestination('https://example.com/fit?id=4', SOURCES)).toBeNull();
  });

  it('ignores an empty or whitespace paste', () => {
    expect(pasteDestination('', SOURCES)).toBeNull();
    expect(pasteDestination('  \n\t\n', SOURCES)).toBeNull();
  });
});

describe('detectPasteDestination', () => {
  const claims = (id: string, verdict: 'match' | 'veto' | 'pass'): PasteDetector<string> => ({
    id,
    detect: () => verdict,
  });

  it('sends a paste matching two detectors to the higher-priority one', () => {
    expect(
      detectPasteDestination('x', SOURCES, [claims('first', 'match'), claims('second', 'match')])
    ).toBe('first');
    expect(
      detectPasteDestination('x', SOURCES, [claims('second', 'match'), claims('first', 'match')])
    ).toBe('second');
  });

  it('falls through a pass to the next detector', () => {
    expect(
      detectPasteDestination('x', SOURCES, [claims('first', 'pass'), claims('second', 'match')])
    ).toBe('second');
  });

  it('stops at a veto so lower-priority detectors cannot reread the paste', () => {
    expect(
      detectPasteDestination('x', SOURCES, [claims('first', 'veto'), claims('second', 'match')])
    ).toBeNull();
  });

  it('does nothing when no detector is confident, or the paste is blank', () => {
    expect(detectPasteDestination('x', SOURCES, [claims('first', 'pass')])).toBeNull();
    expect(detectPasteDestination('   ', SOURCES, [claims('first', 'match')])).toBeNull();
  });

  it('keeps the shipped order: fit, chat link, D-Scan, item list, then Local list', () => {
    expect(PASTE_DETECTORS.map((d) => d.id)).toEqual([
      'fitting',
      'chatLink',
      'dscan',
      'appraisal',
      'pilotList',
    ]);
  });

  it('has Help strings for every registered destination', () => {
    const help = en.shortcuts.pasteDestinations as Record<string, { label: string; opens: string }>;
    for (const { id } of PASTE_DETECTORS) {
      expect(help[id]?.label, id).toBeTruthy();
      expect(help[id]?.opens, id).toBeTruthy();
    }
  });

  it('prefers the fit over the item list when a paste reads as both', () => {
    const fitOfItems = ['[Rifter, Items]', 'Tritanium', 'Pyerite', 'Nocxium'].join('\n');
    expect(pasteDestination(fitOfItems, SOURCES)).toBe('fitting');
  });
});
