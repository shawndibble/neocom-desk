import { salesTaxPct } from '@/engine/industry/fees';
import type { PlanAdvice, PlanAdviceInput } from '../planAdviceModel';
import { buildPlanAdvice } from '../planAdviceModel';
import { askAdvice } from '../planAdviceAsync';
import type { RosterColony } from '../roster';
import type { RowAdvice } from './coloniesModel';

export interface AltCharacterAdvice {
  byPlanetId: ReadonlyMap<number, RowAdvice>;
  makesPerDay: number | null;
}

const UNKNOWN_ACCOUNTING_LEVEL = 0;

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

const NO_FIGURE: AltCharacterAdvice = { byPlanetId: new Map(), makesPerDay: null };

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
