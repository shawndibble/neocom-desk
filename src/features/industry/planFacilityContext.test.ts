import { describe, it, expect } from 'vitest';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import {
  facilityContextFor,
  reactionPlanFacilityContextFor,
  sweepDepthContext,
} from './planFacilityContext';

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

describe('sweepDepthContext', () => {
  const facilityContext = facilityContextFor({
    facility: 'npcStation',
    rigFit: ['none', 'none', 'none'],
    security: 'highsec',
  });

  it('zeroes every pricing field, since depth discovery never prices anything', () => {
    const ctx = sweepDepthContext(facilityContext, null, {});
    expect(ctx.systemCostIndex).toBe(0);
    expect(ctx.adjustedPrices).toEqual({});
    expect(ctx.materialPrices).toEqual({});
  });

  it('carries the plan facility context through unchanged', () => {
    const ctx = sweepDepthContext(facilityContext, null, {});
    expect(ctx.facility).toBe(facilityContext.facility);
    expect(ctx.rigFit).toBe(facilityContext.rigFit);
    expect(ctx.security).toBe(facilityContext.security);
  });

  it('omits reactionFacility when no Reaction Location is configured', () => {
    const ctx = sweepDepthContext(facilityContext, null, {});
    expect(ctx.reactionFacility).toBeUndefined();
  });

  it('fills reactionFacility from the plan-level (not price-resolved) Reaction Location, zeroed the same way', () => {
    const reactionPlanFacilityContext = reactionPlanFacilityContextFor({
      reactionFacility: 'tatara',
      reactionRigFit: ['meT2', 'teT2', 'none'],
      reactionFacilityTaxPct: 2,
    });
    const ctx = sweepDepthContext(facilityContext, reactionPlanFacilityContext, {});
    // Ready the instant a Reaction Location is configured — never waiting on
    // a live systemCostIndex the way the price-resolved reactionFacilityContext
    // does, which is the bug this seam exists to not repeat.
    expect(ctx.reactionFacility).toEqual({
      facility: FACILITY_PRESETS.tatara,
      rigFit: ['meT2', 'teT2', 'none'],
      security: 'highsec',
      facilityTaxPct: 2,
      systemCostIndex: 0,
    });
  });
});
