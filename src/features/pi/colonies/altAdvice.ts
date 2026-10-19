/**
 * Other Characters' colonies, priced for display only.
 *
 * Scope decision 20260906-145512 stands: alts never shape the plan. This is a
 * second `buildPlanAdvice` call per alt on the same hub books, whose output
 * only feeds that alt's rows and group header on Colonies. It is never merged
 * into the active Character's `PlanAdvice`, so Plan and Map totals cannot move.
 *
 * No invented numbers: the roster never reads an alt's skills, so Customs Code
 * Expertise, Command Center Upgrades, Interplanetary Consolidation and
 * Accounting all go in as unknown, which the model prices conservatively (the
 * un-reduced customs rate, the full sales tax). An alt colony with no cached
 * detail gets no figure rather than a zero.
 */
import { salesTaxPct } from '@/engine/industry/fees';
import type { PlanAdvice, PlanAdviceInput } from '../planAdviceModel';
import { buildPlanAdvice } from '../planAdviceModel';
import { askAdvice } from '../planAdviceAsync';
import type { RosterColony } from '../roster';
import type { RowAdvice } from './coloniesModel';

export interface AltCharacterAdvice {
  /** Per planet; a colony the model could not price is absent, not zero. */
  byPlanetId: ReadonlyMap<number, RowAdvice>;
  /** Summed over the colonies with a figure; null when none has one. */
  makesPerDay: number | null;
}

/** Accounting level 0: an alt's skills are never read, so the full sales tax applies. */
const UNKNOWN_ACCOUNTING_LEVEL = 0;

/**
 * Alt colonies grouped by owning character. A colony whose system security is
 * missing or unresolved gets no figure: the model reads an unknown security as
 * highsec, which would price a nullsec colony at the cheap customs rate and
 * overstate it.
 */
export function groupAltColonies(
  colonies: readonly RosterColony[],
  securityBySystem: ReadonlyMap<number, number | null>
): ReadonlyMap<number, readonly RosterColony[]> {
  const byCharacter = new Map<number, RosterColony[]>();
  for (const colony of colonies) {
    if (securityBySystem.get(colony.planet.solar_system_id) == null) continue;
    const list = byCharacter.get(colony.characterId);
    if (list) list.push(colony);
    else byCharacter.set(colony.characterId, [colony]);
  }
  return byCharacter;
}

/** The model input for one alt's colonies: unknown skills, the full sales tax, no what-if. */
function altInput(
  input: PlanAdviceInput,
  owned: readonly RosterColony[],
  securityBySystem: ReadonlyMap<number, number | null>
): PlanAdviceInput {
  const details = new Map(
    owned.flatMap((colony) => (colony.detail ? [[colony.planet.planet_id, colony.detail]] : []))
  );
  return {
    ...input,
    snapshot: {
      ...input.snapshot,
      colonies: owned.map((colony) => colony.planet),
      details,
      securityBySystem,
      customsSkill: null,
    },
    books: { ...input.books, salesTaxPct: salesTaxPct(UNKNOWN_ACCOUNTING_LEVEL) },
    skills: { commandCenterUpgrades: null, interplanetaryConsolidation: null },
    whatIfTypes: undefined,
  };
}

function toAltAdvice(advice: PlanAdvice): AltCharacterAdvice {
  return {
    byPlanetId: new Map(
      advice.colonies.map((colony) => [
        colony.planetId,
        { quickWins: colony.quickWins, todayPerDay: colony.todayPerDay },
      ])
    ),
    makesPerDay: advice.totals.todayPerDay,
  };
}

/** A model failure is no figure, never a broken tab (same as the active Character's hook). */
const NO_FIGURE: AltCharacterAdvice = { byPlanetId: new Map(), makesPerDay: null };

/** One alt's advice: a single `buildPlanAdvice` run, so callers can slice between characters. */
export function buildOneAltAdvice(
  input: PlanAdviceInput,
  owned: readonly RosterColony[],
  securityBySystem: ReadonlyMap<number, number | null>
): AltCharacterAdvice {
  try {
    return toAltAdvice(buildPlanAdvice(altInput(input, owned, securityBySystem)));
  } catch {
    return NO_FIGURE;
  }
}

/** `buildOneAltAdvice` off the main thread where the browser has a Worker. */
export async function askOneAltAdvice(
  input: PlanAdviceInput,
  owned: readonly RosterColony[],
  securityBySystem: ReadonlyMap<number, number | null>
): Promise<AltCharacterAdvice> {
  try {
    return toAltAdvice(await askAdvice(altInput(input, owned, securityBySystem)));
  } catch {
    return NO_FIGURE;
  }
}

export function buildAltAdvice(
  input: PlanAdviceInput,
  colonies: readonly RosterColony[],
  securityBySystem: ReadonlyMap<number, number | null>
): ReadonlyMap<number, AltCharacterAdvice> {
  const result = new Map<number, AltCharacterAdvice>();
  for (const [characterId, owned] of groupAltColonies(colonies, securityBySystem)) {
    result.set(characterId, buildOneAltAdvice(input, owned, securityBySystem));
  }
  return result;
}
