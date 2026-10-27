import { describe, expect, it } from 'vitest';
import { EMPIRE_FACTION_IDS, ORE_FACTION_ID, STACKED_CLASSES, treeFor } from './templates';

const CALDARI = 500001;
const CONCORD = 500006;
const SANSHA = 500019;
const ORE = ORE_FACTION_ID;

const byId = (defs: ReturnType<typeof treeFor>) => new Map(defs.map((d) => [d.id, d]));

describe('faction sets', () => {
  it('names the four empires, ORE and the stacked Navy/faction classes', () => {
    expect([...EMPIRE_FACTION_IDS].sort()).toEqual([500001, 500002, 500003, 500004]);
    expect(ORE_FACTION_ID).toBe(500014);
    expect([...STACKED_CLASSES].sort((a, b) => a - b)).toEqual([
      9, 17, 25, 47, 2101, 2102, 2110, 2111,
    ]);
  });
});

describe('treeFor', () => {
  it('uses the empire template for an empire: Corvette roots the main line and the Shuttle', () => {
    const tree = byId(treeFor(CALDARI, new Set([4, 8, 9, 14, 35, 36])));
    expect(tree.get(4)).toEqual({ id: 4, parent: null, lane: 'main' });
    expect(tree.get(8)).toEqual({ id: 8, parent: 4, lane: 'main' });
    expect(tree.get(9)).toEqual({ id: 9, parent: 8, lane: 'branch' });
    expect(tree.get(35)).toEqual({ id: 35, parent: 4, lane: 'industry' });
    expect(tree.get(36)).toEqual({ id: 36, parent: 35, lane: 'industry' });
  });

  it('keeps only present classes, in template order', () => {
    expect(treeFor(CALDARI, new Set([14, 8])).map((d) => d.id)).toEqual([8, 14]);
  });

  it('re-hangs a class whose parent is missing on its nearest present ancestor', () => {
    // Sansha has a Carrier but no Dreadnought.
    const tree = byId(treeFor(SANSHA, new Set([8, 16, 26, 33])));
    expect(tree.get(33)).toEqual({ id: 33, parent: 26, lane: 'capital' });
  });

  it('puts Covert Ops, Recon and Black Ops on the main line for non-empire factions', () => {
    const tree = byId(treeFor(CONCORD, new Set([12, 18, 27, 35, 96])));
    expect(tree.get(35)).toEqual({ id: 35, parent: null, lane: 'main' });
    expect(tree.get(12)).toEqual({ id: 12, parent: null, lane: 'main' });
    // Main-line parents fall through the missing hull sizes to none; the
    // main line is ordered by the template, not by parent.
    expect(tree.get(18)).toEqual({ id: 18, parent: null, lane: 'main' });
    expect(tree.get(27)).toEqual({ id: 27, parent: null, lane: 'main' });
    expect([...tree.keys()]).toEqual([35, 12, 18, 27, 96]);
    expect(tree.get(96)).toEqual({ id: 96, parent: 18, lane: 'branch' });
  });

  it('uses the ORE template: hauler line with the Freighter as a drop', () => {
    const tree = byId(treeFor(ORE, new Set([41, 2108, 42, 44, 45, 46, 37])));
    expect(tree.get(42)).toEqual({ id: 42, parent: 2108, lane: 'main' });
    expect(tree.get(44)).toEqual({ id: 44, parent: null, lane: 'industry' });
    expect(tree.get(46)).toEqual({ id: 46, parent: 45, lane: 'industry' });
    expect(tree.get(37)).toEqual({ id: 37, parent: 44, lane: 'drop' });
  });

  it('appends a class the template does not know as a parentless branch', () => {
    const defs = treeFor(CALDARI, new Set([8, 9999]));
    expect(defs[defs.length - 1]).toEqual({ id: 9999, parent: null, lane: 'branch' });
  });
});
