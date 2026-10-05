/**
 * The Goal Planner's reads: the active Character's colonies and everything a
 * `PlannerColony` is built from. A slim loader over the same lower-level
 * reads the Advisor's own loader uses, not a move of it — see
 * `goalPlannerModel.ts`'s header for why.
 *
 * Prices are a second call (`loadGoalPlannerPrices`) because they depend on
 * the pilot's hub: switching hub must not refetch every colony.
 *
 * Every optional read degrades rather than failing the tab, the Advisor's
 * rule: an unresolved planet radius leaves that colony's link cost to be
 * borrowed, an unresolved security reads as highsec (the rate that cannot
 * understate customs), unknown skills are `null`.
 */
import { loadPi, loadPiPlanetRadius } from '@/sde/loadSde';
import { db } from '@/db';
import type { TradeHub } from '@/market/hubs';
import type { CharacterPlanet, CharacterPlanetDetail } from '@/esi/endpoints';
import { loadSystemNameAndSecurity } from '@/features/character/systemSecurity';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadAllColonyDetails, loadCharacterPlanets } from './data';
import { loadPlanetName } from './names';
import { loadCustomsCodeExpertise } from './customsRate';
import { loadAccountingLevel } from './salesTaxRate';
import {
  parseCustomsOverrides,
  SYNCED_PI_CUSTOMS_KEY,
  type CustomsOverrides,
} from './customsOverride';
import { loadPlanPrices, type PlanPrices } from './planPrices';
import { plannableTypeIds } from './products';
import type { PlannerSnapshot } from './goalPlannerModel';

export interface GoalPlannerSnapshot extends PlannerSnapshot {
  /** The planets read came back 403: a missing scope, not an empty list. */
  needsReauth: boolean;
  /** When the colony list was read; null when nothing is cached. */
  fetchedAt: Date | null;
  planetNames: ReadonlyMap<number, string>;
  systemNames: ReadonlyMap<number, string>;
  customsOverrides: CustomsOverrides;
  /** Accounting; null when the character's skills never loaded. */
  accountingLevel: number | null;
}

export async function loadGoalPlannerSnapshot(characterId: number): Promise<GoalPlannerSnapshot> {
  const nowMs = Date.now();
  const [pi, radiusRaw, planets, customsSkill, accountingLevel, overridesRow] = await Promise.all([
    loadPi(),
    loadPiPlanetRadius().catch(() => ({}) as Record<string, number>),
    loadCharacterPlanets(characterId),
    loadCustomsCodeExpertise(characterId, nowMs).catch(() => null),
    loadAccountingLevel(characterId, nowMs).catch(() => null),
    db.settings.get(SYNCED_PI_CUSTOMS_KEY).catch(() => undefined),
  ]);
  const colonies: CharacterPlanet[] = planets.cached?.data ?? [];
  const systemIds = [...new Set(colonies.map((colony) => colony.solar_system_id))];

  const planetNames = new Map<number, string>();
  const [detailResults, systems] = await Promise.all([
    loadAllColonyDetails(
      characterId,
      colonies.map((colony) => colony.planet_id)
    ),
    Promise.all(
      systemIds.map((systemId) =>
        loadSystemNameAndSecurity(systemId).catch(() => ({ name: null, security: null }))
      )
    ),
    mapWithConcurrencyLimit(colonies, ESI_FANOUT_CONCURRENCY, async (colony) => {
      const name = await loadPlanetName(colony.planet_id).catch(() => null);
      if (name) planetNames.set(colony.planet_id, name);
    }),
  ]);

  const details = new Map<number, CharacterPlanetDetail>();
  for (const [planetId, result] of detailResults) {
    const data = result.cached?.data;
    if (data) details.set(planetId, data);
  }
  const securityBySystem = new Map<number, number | null>();
  const systemNames = new Map<number, string>();
  systemIds.forEach((systemId, i) => {
    securityBySystem.set(systemId, systems[i].security);
    const name = systems[i].name;
    if (name) systemNames.set(systemId, name);
  });

  return {
    pi,
    nowMs,
    colonies,
    details,
    planetRadiusKm: new Map(Object.entries(radiusRaw).map(([id, km]) => [Number(id), km])),
    securityBySystem,
    customsSkill,
    needsReauth: planets.needsReauth,
    fetchedAt: planets.cached ? new Date(planets.cached.fetchedAt) : null,
    planetNames,
    systemNames,
    // Whatever a sync last wrote, validated: not necessarily this version's.
    customsOverrides: parseCustomsOverrides(overridesRow?.value),
    accountingLevel,
  };
}

/** Both sides of the hub book for every planetary commodity — about eighty types, one read. */
export function loadGoalPlannerPrices(
  hub: TradeHub,
  pi: PlannerSnapshot['pi']
): Promise<PlanPrices> {
  return loadPlanPrices(hub, [
    ...new Set([...pi.raw.map((resource) => resource.typeID), ...plannableTypeIds(pi)]),
  ]);
}
