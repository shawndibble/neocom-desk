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
import { buildPlanAdvice, type PlanAdviceInput } from '../planAdviceModel';
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
 * @param securityBySystem Security of the alt colonies' systems, by id. A colony
 *   whose system is missing or unresolved gets no figure: the model reads an
 *   unknown security as highsec, which would price a nullsec colony at the cheap
 *   customs rate and overstate it.
 */
export function buildAltAdvice(
  input: PlanAdviceInput,
  colonies: readonly RosterColony[],
  securityBySystem: ReadonlyMap<number, number | null>
): ReadonlyMap<number, AltCharacterAdvice> {
  const byCharacter = new Map<number, RosterColony[]>();
  for (const colony of colonies) {
    if (securityBySystem.get(colony.planet.solar_system_id) == null) continue;
    const list = byCharacter.get(colony.characterId);
    if (list) list.push(colony);
    else byCharacter.set(colony.characterId, [colony]);
  }

  const result = new Map<number, AltCharacterAdvice>();
  for (const [characterId, owned] of byCharacter) {
    const details = new Map(
      owned.flatMap((colony) => (colony.detail ? [[colony.planet.planet_id, colony.detail]] : []))
    );
    try {
      const advice = buildPlanAdvice({
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
      });
      result.set(characterId, {
        byPlanetId: new Map(
          advice.colonies.map((colony) => [
            colony.planetId,
            { quickWins: colony.quickWins, todayPerDay: colony.todayPerDay },
          ])
        ),
        makesPerDay: advice.totals.todayPerDay,
      });
    } catch {
      // Same as the active Character's hook: a model failure is no figure, never a broken tab.
      result.set(characterId, { byPlanetId: new Map(), makesPerDay: null });
    }
  }
  return result;
}
