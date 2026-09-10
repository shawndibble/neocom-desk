import { describe, it, expect } from 'vitest';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import { facilityContextFor, reactionPlanFacilityContextFor } from './planFacilityContext';

describe('reactionPlanFacilityContextFor', () => {
  it('is null when no Reaction Location is configured', () => {
    expect(reactionPlanFacilityContextFor({})).toBeNull();
  });

  it('reads the Reaction Location fields, defaulting security to highsec', () => {
    expect(
      reactionPlanFacilityContextFor({
        reactionFacility: 'tatara',
        reactionRigFit: ['meT2', 'teT2', 'none'],
        reactionFacilityTaxPct: 2,
      })
    ).toEqual({
      facility: FACILITY_PRESETS.tatara,
      rigFit: ['meT2', 'teT2', 'none'],
      security: 'highsec',
      facilityTaxPct: 2,
    });
  });

  it('honours an explicit reaction security band', () => {
    expect(
      reactionPlanFacilityContextFor({
        reactionFacility: 'athanor',
        reactionSecurity: 'nullsec',
      })?.security
    ).toBe('nullsec');
  });
});

describe('facilityContextFor', () => {
  it('still works for the plan’s own primary location, unaffected by the reaction helper', () => {
    expect(
      facilityContextFor({
        facility: 'raitaru',
        rigFit: ['meT1', 'none', 'none'],
        security: 'highsec',
        facilityTaxPct: 1,
      })
    ).toEqual({
      facility: FACILITY_PRESETS.raitaru,
      rigFit: ['meT1', 'none', 'none'],
      security: 'highsec',
      facilityTaxPct: 1,
    });
  });
});
