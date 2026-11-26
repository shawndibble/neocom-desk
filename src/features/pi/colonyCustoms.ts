import {
  colonySpaceFor,
  customsRateSource,
  defaultCustomsRate,
  type CustomsRateSource,
} from './customsRate';
import type { PlanColonyAdvice } from './planAdviceModel';
import { customsRateFor, type CustomsOverrides } from './customsOverride';

export const ASSUMED_UNKNOWN_CUSTOMS = 0.1;

export interface ResolvedColonyCustoms {
  taxRate: number;
  taxSource: CustomsRateSource;
  taxOverridden: boolean;
  rateUnknown: boolean;
  taxAssumed: boolean;
}

export function resolveColonyCustoms(input: {
  systemId: number;
  security: number | null;
  skill: number | null;
  overrides: CustomsOverrides;
}): ResolvedColonyCustoms {
  const { systemId, security, skill, overrides } = input;
  const space = colonySpaceFor(security);
  const taxOverridden = overrides[systemId] !== undefined;
  const rateUnknown = space !== 'highsec' && !taxOverridden;
  const taxRate = rateUnknown
    ? ASSUMED_UNKNOWN_CUSTOMS
    : customsRateFor(systemId, overrides, defaultCustomsRate(space, skill));
  return {
    taxRate,
    taxSource: customsRateSource(space, skill),
    taxOverridden,
    rateUnknown,
    taxAssumed: rateUnknown,
  };
}

export function assumedCustomsNames(
  colonies: readonly Pick<PlanColonyAdvice, 'taxAssumed' | 'name' | 'planetId'>[],
  fallback: (planetId: number) => string
): string[] {
  return colonies.filter((c) => c.taxAssumed).map((c) => c.name ?? fallback(c.planetId));
}
