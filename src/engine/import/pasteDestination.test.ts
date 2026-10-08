import { describe, expect, it } from 'vitest';
import type { AppraisalCatalogue } from '@/engine/market/appraisalMatch';
import { pasteDestination, type PasteSources } from '@/engine/import/pasteDestination';

const CATALOGUE: AppraisalCatalogue = new Map(
  ['Rifter', 'Damage Control II', 'Tritanium', 'Pyerite', 'Nocxium', 'Warp Disruptor II'].map(
    (name, index) => [name.toLowerCase(), { typeId: index + 1, name }]
  )
);

const HULLS: ReadonlySet<string> = new Set(['rifter']);
const SKILLS = new Map([
  ['gunnery', { typeID: 3300 }],
  ['small hybrid turret', { typeID: 3301 }],
]);
const SOURCES = { catalogue: CATALOGUE, hullNames: HULLS, skillByName: SKILLS };

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
    expect(pasteDestination('Tritanium\nhello there\nsee you in local\no7', SOURCES)).toBeNull();
  });

  it('ignores prose and links', () => {
    expect(pasteDestination('Tritanium is cheap today', SOURCES)).toBeNull();
    expect(pasteDestination('https://example.com/fit?id=4', SOURCES)).toBeNull();
  });

  describe('skill plans', () => {
    // Skill books are market items too, so the catalogue knows the skill names.
    const WITH_BOOKS: PasteSources = {
      ...SOURCES,
      catalogue: new Map([
        ...CATALOGUE,
        ['gunnery', { typeId: 100, name: 'Gunnery' }],
        ['small hybrid turret', { typeId: 101, name: 'Small Hybrid Turret' }],
      ]),
    };

    it('sends an in-game skill plan to the Skills planner', () => {
      expect(pasteDestination('Gunnery V\nSmall Hybrid Turret IV', WITH_BOOKS)).toBe('skillPlan');
    });

    it('sends an EVEMon plan with arabic levels and SP notes to the Skills planner', () => {
      expect(pasteDestination('Gunnery 4 (1,000 SP)\r\nSmall Hybrid Turret 3', WITH_BOOKS)).toBe(
        'skillPlan'
      );
    });

    it('keeps an item list whose names collide with skills in the Appraisal', () => {
      expect(pasteDestination('Gunnery\t500\nSmall Hybrid Turret\t20', WITH_BOOKS)).toBe(
        'appraisal'
      );
      expect(pasteDestination('Gunnery x3\nSmall Hybrid Turret x2', WITH_BOOKS)).toBe('appraisal');
    });

    it('keeps a list mixing skill names with other items in the Appraisal', () => {
      expect(pasteDestination('Gunnery 5\nTritanium 10\nPyerite 20', WITH_BOOKS)).toBe('appraisal');
    });

    it('ignores a plan with a line that is not a skill at all', () => {
      expect(pasteDestination('Gunnery V\nsee you in local', WITH_BOOKS)).toBeNull();
    });

    it('still reads a bracketed fit as a fit', () => {
      expect(pasteDestination('[Rifter, Gunnery 5]\n\nDamage Control II', WITH_BOOKS)).toBe(
        'fitting'
      );
    });
  });

  it('ignores an empty or whitespace paste', () => {
    expect(pasteDestination('', SOURCES)).toBeNull();
    expect(pasteDestination('  \n\t\n', SOURCES)).toBeNull();
  });
});
