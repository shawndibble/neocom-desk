import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, type BuildPlanRecord } from '@/db';
import type { BlueprintMap, TypeMap } from '@/sde/types';
import {
  findMatchingBuildPlans,
  createBuildPlanForJob,
  jobProductionSeed,
} from './logProductionFromJob';

const BLUEPRINTS: BlueprintMap = {
  '638': {
    name: 'Rifter Blueprint',
    time: 1200,
    materials: [{ typeID: 34, quantity: 100 }],
    products: [{ typeID: 587, quantity: 1 }],
    skills: [],
    activity: 'manufacturing',
  },
};
const TYPES: TypeMap = {
  '587': { name: 'Rifter', groupID: 25, volume: 27289 },
  '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
};

vi.mock('@/sde/loadSde', () => ({
  loadTypes: vi.fn(async () => TYPES),
  loadBlueprints: vi.fn(async () => BLUEPRINTS),
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
}));

const CHAR_ID = 91;

function plan(overrides: Partial<BuildPlanRecord> = {}): BuildPlanRecord {
  return {
    id: crypto.randomUUID(),
    characterId: CHAR_ID,
    name: 'A plan',
    blueprintTypeID: 638,
    runs: 1,
    me: 0,
    te: 0,
    facility: 'npcStation',
    security: 'highsec',
    hubId: 'jita',
    updatedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(async () => {
  await db.buildPlans.clear();
});

describe('jobProductionSeed', () => {
  it('carries the job runs and cost, defaulting a missing cost to 0', () => {
    expect(jobProductionSeed({ runs: 5, cost: 12345 })).toEqual({ runs: 5, jobFee: 12345 });
    expect(jobProductionSeed({ runs: 2, cost: undefined })).toEqual({ runs: 2, jobFee: 0 });
  });
});

describe('findMatchingBuildPlans', () => {
  it('returns the character’s plans building this blueprint, and none other', async () => {
    const match = plan({ blueprintTypeID: 638 });
    await db.buildPlans.bulkAdd([
      match,
      plan({ blueprintTypeID: 999 }),
      plan({ characterId: CHAR_ID + 1, blueprintTypeID: 638 }),
    ]);

    const found = await findMatchingBuildPlans(CHAR_ID, { blueprint_type_id: 638 });
    expect(found.map((p) => p.id)).toEqual([match.id]);
  });

  it('returns every match when more than one plan builds the same blueprint', async () => {
    const a = plan({ blueprintTypeID: 638, name: 'Plan A' });
    const b = plan({ blueprintTypeID: 638, name: 'Plan B' });
    await db.buildPlans.bulkAdd([a, b]);

    const found = await findMatchingBuildPlans(CHAR_ID, { blueprint_type_id: 638 });
    expect(found.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('returns an empty array when nothing matches', async () => {
    await db.buildPlans.bulkAdd([plan({ blueprintTypeID: 999 })]);
    const found = await findMatchingBuildPlans(CHAR_ID, { blueprint_type_id: 638 });
    expect(found).toEqual([]);
  });
});

describe('createBuildPlanForJob', () => {
  it('creates and persists a plan for the job’s blueprint, defaulted from scratch', async () => {
    const id = await createBuildPlanForJob(CHAR_ID, { blueprint_type_id: 638 });
    expect(id).not.toBeNull();
    const stored = await db.buildPlans.get(id!);
    expect(stored?.characterId).toBe(CHAR_ID);
    expect(stored?.blueprintTypeID).toBe(638);
    expect(stored?.name).toBe('Rifter');
  });

  it('inherits facility/hub from the character’s most recently updated plan', async () => {
    await db.buildPlans.add(
      plan({ blueprintTypeID: 999, facility: 'athanor', hubId: 'rens', updatedAt: 100 })
    );
    const id = await createBuildPlanForJob(CHAR_ID, { blueprint_type_id: 638 });
    const stored = await db.buildPlans.get(id!);
    expect(stored?.hubId).toBe('rens');
  });

  it('returns null for a blueprint the SDE catalog has no entry for', async () => {
    const id = await createBuildPlanForJob(CHAR_ID, { blueprint_type_id: 424242 });
    expect(id).toBeNull();
  });
});
