import { describe, expect, it } from 'vitest';
import type { BuildPlanRecord } from '@/db';
import { EMPTY_RIG_FIT } from '@/engine/industry/types';
import { rememberedLocationsFromEdit } from './rememberLocationFromEdit';

function plan(overrides: Partial<BuildPlanRecord> = {}): BuildPlanRecord {
  return {
    id: 'p',
    characterId: 1,
    name: 'Plan',
    blueprintTypeID: 638,
    runs: 1,
    me: 0,
    te: 0,
    facility: 'npcStation',
    rigFit: EMPTY_RIG_FIT,
    security: 'highsec',
    hubId: 'amarr',
    updatedAt: 0,
    ...overrides,
  };
}

const AZBEL_PICK = {
  facility: 'azbel',
  security: 'nullsec',
  buildSystemId: 30003888,
  buildSystemName: 'Badivefi',
  buildLocationId: 1035466617946,
  buildLocationName: 'Badivefi - K2-18 b R&D',
} as const;

describe('rememberedLocationsFromEdit — the primary location', () => {
  it('remembers a Build Location pick as the manufacturing default', () => {
    const remembered = rememberedLocationsFromEdit(
      plan({ rigFit: ['meT1', 'none', 'none'], facilityTaxPct: 4 }),
      AZBEL_PICK,
      'manufacturing'
    );
    // The whole place, not just the facility: the new plan should start where
    // this one now builds, and its rig and tax carry with it (they are the
    // same structure's).
    expect(remembered).toEqual({
      manufacturing: {
        facility: 'azbel',
        rigFit: ['meT1', 'none', 'none'],
        facilityTaxPct: 4,
        security: 'nullsec',
        buildSystemId: 30003888,
        buildSystemName: 'Badivefi',
        buildLocationId: 1035466617946,
        buildLocationName: 'Badivefi - K2-18 b R&D',
        setOnPlanPage: true,
      },
    });
  });

  it('remembers a single-field edit as the whole resulting location', () => {
    const remembered = rememberedLocationsFromEdit(
      plan({ ...AZBEL_PICK, rigFit: EMPTY_RIG_FIT }),
      { rigFit: ['meT2', 'teT2', 'none'] },
      'manufacturing'
    );
    expect(remembered.manufacturing).toMatchObject({
      facility: 'azbel',
      rigFit: ['meT2', 'teT2', 'none'],
      buildSystemName: 'Badivefi',
      buildLocationId: 1035466617946,
    });
  });

  it('leaves out a field the edit cleared, rather than storing it as undefined', () => {
    // Firestore rejects `undefined` at any depth, and the synced write
    // swallows the error — the default would quietly never leave the device.
    const remembered = rememberedLocationsFromEdit(
      plan({ ...AZBEL_PICK, facilityTaxPct: 4 }),
      { facility: 'raitaru', buildLocationId: undefined, buildLocationName: undefined },
      'manufacturing'
    );
    const record = remembered.manufacturing!;
    expect(record.facility).toBe('raitaru');
    expect('buildLocationId' in record).toBe(false);
    expect('buildLocationName' in record).toBe(false);
    expect(Object.values(record)).not.toContain(undefined);
  });

  it('strips rig and tax from an NPC station, the same as the stored record would', () => {
    const remembered = rememberedLocationsFromEdit(
      plan({ facility: 'azbel', rigFit: ['meT1', 'none', 'none'], facilityTaxPct: 4 }),
      { facility: 'npcStation' },
      'manufacturing'
    );
    expect(remembered.manufacturing).toMatchObject({
      facility: 'npcStation',
      rigFit: EMPTY_RIG_FIT,
      facilityTaxPct: null,
    });
  });

  it('reads a pre-#609 plan’s rig fit through the same migration a plan uses', () => {
    const remembered = rememberedLocationsFromEdit(
      plan({ facility: 'azbel', rigFit: undefined, rigLevel: 't1' }),
      { facilityTaxPct: 2 },
      'manufacturing'
    );
    expect(remembered.manufacturing?.rigFit).toEqual(['meT1', 'teT1', 'none']);
  });

  it('remembers a reaction-activity plan’s location as the reaction default', () => {
    // A reaction plan has no separate Reaction Location — its own facility is
    // where its reactions run, which is the one fact the reaction default holds.
    const remembered = rememberedLocationsFromEdit(
      plan({ facility: 'athanor' }),
      { facility: 'tatara', buildSystemId: 30003888, buildSystemName: 'Badivefi' },
      'reaction'
    );
    expect(remembered).toEqual({
      reaction: {
        facility: 'tatara',
        rigFit: EMPTY_RIG_FIT,
        facilityTaxPct: null,
        security: 'highsec',
        buildSystemId: 30003888,
        buildSystemName: 'Badivefi',
        setOnPlanPage: true,
      },
    });
  });

  it('remembers nothing when the result names a facility the activity cannot host', () => {
    // Not reachable from the picker, which filters by activity — but a
    // remembered Raitaru would seed reaction plans at a place that cannot run them.
    expect(
      rememberedLocationsFromEdit(
        plan({ facility: 'athanor' }),
        { facility: 'raitaru' },
        'reaction'
      )
    ).toEqual({});
  });

  it.each<[string, Partial<BuildPlanRecord>]>([
    ['runs', { runs: 5 }],
    ['the trade hub', { hubId: 'jita' }],
    ['material sourcing', { buildHere: [34] }],
    ['the material price basis', { materialPriceBasis: 'buy' }],
    ['the Include Reactions flag alone', { includeReactions: true }],
  ])('remembers nothing for an edit to %s', (_label, patch) => {
    expect(rememberedLocationsFromEdit(plan({ ...AZBEL_PICK }), patch, 'manufacturing')).toEqual(
      {}
    );
  });
});

describe('rememberedLocationsFromEdit — the Reaction Location', () => {
  const withReactions = plan({
    includeReactions: true,
    reactionFacility: 'athanor',
    reactionRigFit: EMPTY_RIG_FIT,
    reactionSecurity: 'highsec',
  });

  it('remembers a Reaction Location pick as the reaction default, under its own field names', () => {
    const remembered = rememberedLocationsFromEdit(
      withReactions,
      {
        reactionFacility: 'tatara',
        reactionSecurity: 'lowsec',
        reactionBuildSystemId: 30002053,
        reactionBuildSystemName: 'Hek',
        reactionBuildLocationId: 1022734985679,
        reactionBuildLocationName: 'Hek - Refinery',
      },
      'manufacturing'
    );
    expect(remembered).toEqual({
      reaction: {
        facility: 'tatara',
        rigFit: EMPTY_RIG_FIT,
        facilityTaxPct: null,
        security: 'lowsec',
        buildSystemId: 30002053,
        buildSystemName: 'Hek',
        buildLocationId: 1022734985679,
        buildLocationName: 'Hek - Refinery',
        setOnPlanPage: true,
      },
    });
  });

  it('carries the reaction tax and rig fit', () => {
    const remembered = rememberedLocationsFromEdit(
      { ...withReactions, reactionRigFit: ['meT2', 'none', 'none'] },
      { reactionFacilityTaxPct: 1.5 },
      'manufacturing'
    );
    expect(remembered.reaction).toMatchObject({
      facility: 'athanor',
      rigFit: ['meT2', 'none', 'none'],
      facilityTaxPct: 1.5,
    });
  });

  it('leaves the manufacturing default alone when only the Reaction Location changed', () => {
    const remembered = rememberedLocationsFromEdit(
      withReactions,
      { reactionFacility: 'tatara' },
      'manufacturing'
    );
    expect('manufacturing' in remembered).toBe(false);
  });

  it('remembers nothing for a Reaction Location field on a plan that has no Reaction Location', () => {
    expect(
      rememberedLocationsFromEdit(plan(), { reactionFacilityTaxPct: 2 }, 'manufacturing')
    ).toEqual({});
  });
});
