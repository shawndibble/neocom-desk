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

export function buildAltAdvice(
  input: PlanAdviceInput,
  colonies: readonly RosterColony[]
): ReadonlyMap<number, AltCharacterAdvice> {
  const byCharacter = new Map<number, RosterColony[]>();
  for (const colony of colonies) {
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
          customsSkill: null,
        },
        books: { ...input.books, salesTaxPct: salesTaxPct(0) },
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
      result.set(characterId, { byPlanetId: new Map(), makesPerDay: null });
    }
  }
  return result;
}
