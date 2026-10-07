/**
 * One answer to "what customs rate is this colony costed at", shared by every
 * PI tab. Plan, Colonies and Map all read colonies through it (Plan via
 * `plannerColonies`, the other two via `buildPlanAdvice`, which wraps the same
 * rows), so a colony can never carry two rates on two tabs.
 */
import {
  colonySpaceFor,
  customsRateSource,
  defaultCustomsRate,
  type CustomsRateSource,
} from './customsRate';
import type { PlanColonyAdvice } from './planAdviceModel';
import { customsRateFor, type CustomsOverrides } from './customsOverride';

/**
 * What an unknown player-office rate is costed at: the untrained highsec NPC
 * rate, a common owner tax and the conservative direction (never 0%).
 */
export const ASSUMED_UNKNOWN_CUSTOMS = 0.1;

export interface ResolvedColonyCustoms {
  taxRate: number;
  taxSource: CustomsRateSource;
  /** The pilot typed this system's rate themselves. */
  taxOverridden: boolean;
  /** Outside highsec with no override: nothing in ESI says what the office charges. */
  rateUnknown: boolean;
  /** `taxRate` is `ASSUMED_UNKNOWN_CUSTOMS`, standing in for an unknown rate. */
  taxAssumed: boolean;
}

export function resolveColonyCustoms(input: {
  systemId: number;
  /** The system's security status; null when it never resolved. */
  security: number | null;
  /** Customs Code Expertise level; null when skill data never loaded. */
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

/** The colonies whose customs figure is the assumed stand-in, named for the note. */
export function assumedCustomsNames(
  colonies: readonly Pick<PlanColonyAdvice, 'taxAssumed' | 'name' | 'planetId'>[],
  fallback: (planetId: number) => string
): string[] {
  return colonies.filter((c) => c.taxAssumed).map((c) => c.name ?? fallback(c.planetId));
}
