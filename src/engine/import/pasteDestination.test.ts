import { describe, expect, it } from 'vitest';
import type { AppraisalCatalogue } from '@/engine/market/appraisalMatch';
import { pasteDestination } from '@/engine/import/pasteDestination';

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

  it('sends a D-Scan to Pilot Lookup', () => {
    expect(pasteDestination('626\tMy Vexor\tVexor\t1 km\n626\tB\tVexor\t2 km', SOURCES)).toBe(
      'pilotList'
    );
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
