import { DEFAULT_ASSUMED_ME } from './assumedMe';
import type { BuildPlanPricingInputs } from './buildPlanPricingInputs';

export const PRICING_INPUTS_FIXTURE: BuildPlanPricingInputs = {
  hydrated: true,
  assumedMe: DEFAULT_ASSUMED_ME,
  profitBasis: 'sellValue',
  corpBlueprints: { blueprints: [], available: false, incomplete: false },
  standings: new Map(),
  bpcRows: [],
  communityRows: [],
};
