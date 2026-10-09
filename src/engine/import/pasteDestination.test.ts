import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en.json';
import type { AppraisalCatalogue } from '@/engine/market/appraisalMatch';
import {
  detectPasteDestination,
  PASTE_DETECTORS,
  pasteDestination,
  type PasteDetector,
  type PasteSources,
} from '@/engine/import/pasteDestination';

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
const SOURCES: PasteSources = { catalogue: CATALOGUE, hullNames: HULLS, skillByName: SKILLS };

const FIT = ['[Rifter, Kite Fit]', '', 'Damage Control II', '', 'Warp Disruptor II'].join('\n');

const SCAN = [
  'Pyroxeres\t8,016\t2,404 m3\t184,000.00 ISK\t33 km',
  'Pyroxeres II-Grade\t9,840\t2,952 m3\t221,000.00 ISK\t13 km',
].join('\n');

describe('pasteDestination', () => {
  it('sends a scan with empty ore groups to the Survey tab, not the Appraisal', () => {
    // The scanner prints a header for every grade, and some have no rocks.
    const scan = [
      'Scordite II-Grade',
      'Scordite II-Grade\t7,396\t1,109 m3\t128,000.00 ISK\t19 km',
      'Scordite III-Grade',
      'Veldspar',
      'Veldspar\t23,799\t2,379 m3\t223,000.00 ISK\t20 km',
      'Veldspar IV-Grade',
    ].join('\n');
    expect(pasteDestination(scan, SOURCES)).toBe('survey');
  });

  it('sends a Survey Scanner copy to the Survey tab, never the Appraisal', () => {
    expect(pasteDestination(SCAN, SOURCES)).toBe('survey');
    expect(pasteDestination('Tritanium\t1000\nPyerite\t500', SOURCES)).toBe('appraisal');
  });

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
      expect(pasteDestination('Gunnery V\nsee you in local, o7?', WITH_BOOKS)).toBeNull();
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

  it('keeps the shipped order: survey scan, fit, chat link, D-Scan, blueprint list, skill plan, item list, then Local list', () => {
    expect(PASTE_DETECTORS.map((d) => d.id)).toEqual([
      'survey',
      'fitting',
      'chatLink',
      'dscan',
      'blueprintList',
      'skillPlan',
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

  it('sends a mostly-blueprint list to a Build Group, never the Appraisal', () => {
    const blueprintNames = new Set(['rifter blueprint', 'rifter ii invention blueprint']);
    const sources = { ...SOURCES, blueprintNames };
    const catalogue = new Map([
      ...CATALOGUE,
      ['rifter blueprint', { typeId: 99, name: 'Rifter Blueprint' }],
    ]);
    const list = ['Rifter Blueprint\t1', 'Rifter II Invention Blueprint\t1', 'Tritanium\t5'].join(
      '\n'
    );
    expect(pasteDestination(list, { ...sources, catalogue })).toBe('blueprintList');
  });

  it('keeps a mixed list that is mostly other items in the Appraisal', () => {
    const sources = { ...SOURCES, blueprintNames: new Set(['rifter blueprint']) };
    const list = 'Rifter Blueprint\nTritanium\nPyerite';
    expect(pasteDestination(list, sources)).toBe('appraisal');
  });

  it('prefers the fit over the item list when a paste reads as both', () => {
    const fitOfItems = ['[Rifter, Items]', 'Tritanium', 'Pyerite', 'Nocxium'].join('\n');
    expect(pasteDestination(fitOfItems, SOURCES)).toBe('fitting');
  });
});
