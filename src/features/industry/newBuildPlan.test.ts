import { describe, expect, it } from 'vitest';
import type { BuildPlanRecord } from '@/db';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { EMPTY_RIG_FIT, resolveRigFit } from '@/engine/industry/types';
import { DEFAULT_FACILITY_DEFAULTS } from './facilityDefaults';
import type { BlueprintCatalogEntry } from './blueprintCatalog';
import { fallbackFacility, mostRecentlyUpdatedPlan, newBuildPlan } from './newBuildPlan';
import { matchesPlanSeed } from './planSeed';

function entry(activity: 'manufacturing' | 'reaction' = 'manufacturing'): BlueprintCatalogEntry {
  return {
    blueprintTypeID: 638,
    blueprint: {
      name: 'Rifter Blueprint',
      time: 1200,
      materials: [],
      products: [],
      skills: [],
      activity,
    },
    productTypeID: 587,
    productName: 'Rifter',
    productNameLower: 'rifter',
  };
}

function owned(overrides: Partial<CharacterBlueprint> = {}): CharacterBlueprint {
  return {
    item_id: 1,
    type_id: 638,
    location_id: 60003760,
    location_flag: 'Hangar',
    quantity: 1,
    material_efficiency: 10,
    time_efficiency: 20,
    runs: -1,
    ...overrides,
  } as CharacterBlueprint;
}

function plan(overrides: Partial<BuildPlanRecord> & { id: string }): BuildPlanRecord {
  return {
    characterId: 1,
    name: 'Plan',
    blueprintTypeID: 638,
    runs: 1,
    me: 0,
    te: 0,
    facility: 'npcStation',
    rigLevel: 'none',
    security: 'highsec',
    hubId: 'jita',
    updatedAt: 0,
    ...overrides,
  };
}

describe('fallbackFacility', () => {
  it('never offers a facility that cannot host the activity', () => {
    // An NPC station cannot run a reaction and a refinery cannot manufacture.
    expect(fallbackFacility('manufacturing')).toBe('npcStation');
    expect(fallbackFacility('reaction')).toBe('athanor');
  });
});

describe('mostRecentlyUpdatedPlan', () => {
  it('returns null when the character has no plans', () => {
    expect(mostRecentlyUpdatedPlan(undefined)).toBeNull();
    expect(mostRecentlyUpdatedPlan([])).toBeNull();
  });

  it('picks the newest plan', () => {
    const newest = plan({ id: 'b', updatedAt: 500 });
    expect(mostRecentlyUpdatedPlan([plan({ id: 'a', updatedAt: 100 }), newest])).toBe(newest);
  });

  it('keeps the first of a tie, which is why Fit Import stamps its hull newer', () => {
    // The comparison is a strict `>`, so plans written in one batch with one
    // `Date.now()` all tie and array order — effectively UUID order — decides.
    const first = plan({ id: 'a', updatedAt: 100 });
    const second = plan({ id: 'b', updatedAt: 100 });
    expect(mostRecentlyUpdatedPlan([first, second])).toBe(first);
  });
});

describe('newBuildPlan — assumed ME and TE', () => {
  it('quotes a blueprint the character does not own at the assumed ME', () => {
    const created = newBuildPlan(1, entry(), null, null, DEFAULT_FACILITY_DEFAULTS, {
      assumedMe: 2,
    });
    expect(created.me).toBe(2);
  });

  it('still quotes an owned blueprint at its real research', () => {
    // The assumption fills the gap where there is nothing to read; it never
    // overrides a real value in either direction.
    const created = newBuildPlan(1, entry(), owned(), null, DEFAULT_FACILITY_DEFAULTS, {
      assumedMe: 2,
    });
    expect(created.me).toBe(10);
    expect(created.te).toBe(20);
  });

  it('defaults to unresearched when no assumption is given', () => {
    const created = newBuildPlan(1, entry(), null, null, DEFAULT_FACILITY_DEFAULTS);
    expect(created.me).toBe(0);
    expect(created.te).toBe(0);
  });

  it('quotes a blueprint the character does not own at the assumed TE (#634)', () => {
    // The commonest unowned case is an invented BPC with no decryptor —
    // ME2/TE4 — and quoting its time at 0 moves job time and ISK/hour.
    const created = newBuildPlan(1, entry(), null, null, DEFAULT_FACILITY_DEFAULTS, {
      assumedMe: 2,
      assumedTe: 4,
    });
    expect(created.me).toBe(2);
    expect(created.te).toBe(4);
  });

  it('still quotes an owned blueprint at its real TE', () => {
    const created = newBuildPlan(1, entry(), owned(), null, DEFAULT_FACILITY_DEFAULTS, {
      assumedMe: 2,
      assumedTe: 4,
    });
    expect(created.te).toBe(20);
  });

  it('assumes ME and TE independently', () => {
    // They are separate preferences: a pilot who set one and not the other
    // must not have the unset half quietly follow the set one.
    const created = newBuildPlan(1, entry(), null, null, DEFAULT_FACILITY_DEFAULTS, {
      assumedTe: 4,
    });
    expect(created.me).toBe(0);
    expect(created.te).toBe(4);
  });
});

describe('newBuildPlan — overrides', () => {
  it('takes runs, group and timestamp from the caller', () => {
    const created = newBuildPlan(1, entry(), null, null, DEFAULT_FACILITY_DEFAULTS, {
      runs: 20,
      buildGroupId: 'g1',
      updatedAt: 12345,
    });
    expect(created.runs).toBe(20);
    expect(created.buildGroupId).toBe('g1');
    expect(created.updatedAt).toBe(12345);
  });

  it('omits buildGroupId entirely for an ungrouped plan', () => {
    // Absent rather than undefined: Firestore rejects undefined at any depth,
    // and the sync spec omits the key on absence.
    const created = newBuildPlan(1, entry(), null, null, DEFAULT_FACILITY_DEFAULTS);
    expect('buildGroupId' in created).toBe(false);
  });
});

describe('newBuildPlan — carried defaults', () => {
  it('carries facility, hub and build system from the last plan of the same activity', () => {
    const previous = plan({
      id: 'p',
      facility: 'raitaru',
      rigLevel: 't1',
      hubId: 'amarr',
      buildSystemId: 30003888,
      buildSystemName: 'Badivefi',
    });
    const created = newBuildPlan(1, entry(), null, previous, DEFAULT_FACILITY_DEFAULTS);
    expect(created.facility).toBe('raitaru');
    // Through `resolveRigFit`, so a plan still in the pre-#609 `rigLevel`
    // shape carries forward as the fit it migrates to.
    expect(created.rigFit).toEqual(resolveRigFit(previous));
    expect(created.hubId).toBe('amarr');
    expect(created.buildSystemName).toBe('Badivefi');
  });

  it('refuses a facility from a plan of the other activity', () => {
    // A Raitaru cannot host a reaction, so the hardcoded fallback wins over
    // the pilot's own most recent plan here.
    const previous = plan({ id: 'p', facility: 'raitaru' });
    const created = newBuildPlan(1, entry('reaction'), null, previous, DEFAULT_FACILITY_DEFAULTS);
    expect(created.facility).toBe('athanor');
    // The fallback brings its own empty fit rather than the rejected
    // facility's rigs, which the new facility could not host anyway.
    expect(created.rigFit).toEqual(EMPTY_RIG_FIT);
  });
});

describe('newBuildPlan — seeded ME/TE (#637)', () => {
  it('opens at the seeded research, over an owned copy at different research', () => {
    // The pilot is quoting a copy they might buy, not the one in the hangar.
    const created = newBuildPlan(1, entry(), owned(), null, DEFAULT_FACILITY_DEFAULTS, {
      me: 4,
      te: 12,
      runs: 5,
    });
    expect(created.me).toBe(4);
    expect(created.te).toBe(12);
    expect(created.runs).toBe(5);
  });

  it('opens at the seeded research over the assumed-ME and assumed-TE preferences', () => {
    const created = newBuildPlan(1, entry(), null, null, DEFAULT_FACILITY_DEFAULTS, {
      assumedMe: 2,
      assumedTe: 4,
      me: 0,
      te: 0,
      runs: 1,
    });
    // Seeded 0 is a real answer about a real copy, not a missing one — an
    // unresearched BPC must not fall through to either assumption (#634).
    expect(created.me).toBe(0);
    expect(created.te).toBe(0);
  });

  it('writes the seed back verbatim, so a seeded plan matches its own seed', () => {
    // `Industry`'s create-if-missing effect stops re-firing only once the plan
    // it wrote matches the seed it was given: were these ever to disagree it
    // would write a plan on every render.
    const seed = { me: 7, te: 14, runs: 3 };
    const created = newBuildPlan(1, entry(), owned(), null, DEFAULT_FACILITY_DEFAULTS, {
      ...seed,
      assumedMe: 2,
      assumedTe: 4,
    });
    expect(matchesPlanSeed(created, seed)).toBe(true);
  });

  it('takes the name the caller supplies, so a seeded plan is tellable apart', () => {
    const created = newBuildPlan(1, entry(), null, null, DEFAULT_FACILITY_DEFAULTS, {
      name: 'Rifter 10/20 ×5',
    });
    expect(created.name).toBe('Rifter 10/20 ×5');
  });

  it('still names a plan after its product when the caller supplies nothing', () => {
    expect(newBuildPlan(1, entry(), null, null, DEFAULT_FACILITY_DEFAULTS).name).toBe('Rifter');
  });
});
