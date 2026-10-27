import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import {
  facilityMemoryKey,
  forgetFacility,
  memoryFromPlan,
  patchFromMemory,
  recallFacility,
  rememberFacility,
} from './facilityMemory';

describe('memoryFromPlan', () => {
  it('captures rigs, tax and cost index of a structure', () => {
    expect(
      memoryFromPlan({
        facility: 'azbel',
        rigFit: ['meT2', 'none', 'none'],
        facilityTaxPct: 2.5,
        costIndexOverridePct: 3.1,
      })
    ).toEqual({ rigFit: ['meT2', 'none', 'none'], facilityTaxPct: 2.5, costIndexPct: 3.1 });
  });

  it('leaves out what is unset, and rigs and tax for an NPC station', () => {
    expect(memoryFromPlan({ facility: 'azbel' })).toEqual({ rigFit: ['none', 'none', 'none'] });
    expect(
      memoryFromPlan({
        facility: 'npcStation',
        rigFit: ['meT2', 'none', 'none'],
        costIndexOverridePct: 2,
      })
    ).toEqual({ costIndexPct: 2 });
  });
});

describe('patchFromMemory', () => {
  it('turns a memory back into plan fields, and nothing for an NPC station rig', () => {
    const entry = {
      rigFit: ['meT2', 'none', 'none'],
      facilityTaxPct: 2.5,
      costIndexPct: 3,
    } as const;
    expect(patchFromMemory(entry, 'azbel')).toEqual({
      rigFit: ['meT2', 'none', 'none'],
      facilityTaxPct: 2.5,
      costIndexOverridePct: 3,
    });
    expect(patchFromMemory(entry, 'npcStation')).toEqual({ costIndexOverridePct: 3 });
  });
});

describe('facilityMemoryKey', () => {
  it('prefers the facility, falls back to the system, else nothing', () => {
    expect(facilityMemoryKey({ buildLocationId: 1234, buildSystemId: 31000001 })).toBe('loc:1234');
    expect(facilityMemoryKey({ buildSystemId: 31000001 })).toBe('sys:31000001');
    expect(facilityMemoryKey({})).toBeNull();
  });
});

describe('the stored memory', () => {
  beforeEach(async () => {
    await db.settings.clear();
  });

  it('recalls what was remembered for the same facility, not another', async () => {
    await rememberFacility({ buildLocationId: 77 }, { costIndexPct: 4 });
    expect(await recallFacility({ buildLocationId: 77 })).toEqual({ costIndexPct: 4 });
    expect(await recallFacility({ buildLocationId: 78 })).toBeNull();
  });

  it('merges a later edit into what was already remembered', async () => {
    await rememberFacility({ buildLocationId: 77 }, { costIndexPct: 4 });
    await rememberFacility({ buildLocationId: 77 }, { facilityTaxPct: 1 });
    expect(await recallFacility({ buildLocationId: 77 })).toEqual({
      costIndexPct: 4,
      facilityTaxPct: 1,
    });
  });

  it('forgets just the cost index when it is cleared', async () => {
    await rememberFacility({ buildSystemId: 31000001 }, { costIndexPct: 4, facilityTaxPct: 1 });
    await forgetFacility({ buildSystemId: 31000001 }, 'costIndexPct');
    expect(await recallFacility({ buildSystemId: 31000001 })).toEqual({ facilityTaxPct: 1 });
  });

  it('keeps both fields when two edits are in flight at once', async () => {
    await Promise.all([
      rememberFacility({ buildLocationId: 5 }, { costIndexPct: 4 }),
      rememberFacility({ buildLocationId: 5 }, { facilityTaxPct: 1 }),
    ]);
    expect(await recallFacility({ buildLocationId: 5 })).toEqual({
      costIndexPct: 4,
      facilityTaxPct: 1,
    });
  });

  it('does nothing for a plan with no place', async () => {
    await rememberFacility({}, { costIndexPct: 4 });
    expect(await recallFacility({})).toBeNull();
  });
});
