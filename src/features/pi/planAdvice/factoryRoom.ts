import type { CharacterPlanet } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { DEFAULT_CUSTOMS_TAX_RATE } from '@/engine/pi/chain';
import { HOURS_PER_DAY, quickWin, type QuickWin, type SellBooks } from '@/engine/pi/planAdvice';
import type { NetworkOpportunity } from '@/engine/pi/network';
import { colonyNetwork } from '../networkModel';
import { dropOtherSystemSurplus, dropSharedSurplus } from '../factoryRoomDedupe';
import { colonyPlan } from '../colonyPlan';
import type { BuiltColonyAdvice, PlanetAdvice } from '../systemPlanetModel';
import type { PlannerColonyRow } from '../goalPlannerModel';

/**
 * Factories a colony has the room for and the surplus P1 to feed, from the
 * network plan: the Advisor's own detector for "room for factories", reused.
 * The plan only offers a P2 no single colony already makes both inputs for
 * (that one is the rebuild scorer's question), so an opportunity usually draws
 * on another colony's surplus: `routedFrom` names those colonies so the page can
 * say what to move. A win routed from another system is dropped: a quick win
 * is doable within one system. Market sourcing is off, so nothing here is a
 * purchase. The network plan needs two measurable colonies.
 */
export function factoryRoom(
  built: readonly (PlannerColonyRow & { advice: BuiltColonyAdvice })[],
  books: SellBooks,
  planetNames: ReadonlyMap<number, string> | undefined,
  pi: PiData
): Map<number, QuickWin[]> {
  const out = new Map<number, QuickWin[]>();
  const advice: PlanetAdvice[] = built.map((row) => ({
    kind: 'built',
    planetId: row.planetId,
    name: planetNames?.get(row.planetId) ?? null,
    planetType: row.planetType as CharacterPlanet['planet_type'],
    colony: row.advice,
  }));
  const network = colonyNetwork({
    advice,
    pi,
    prices: books.prices,
    revenuePrices: books.revenuePrices,
    allowMarketSourcing: false,
    taxRateByPlanet: new Map(built.map((row) => [row.planetId, row.taxRate])),
    taxRate: built.length > 0 ? built[0].taxRate : DEFAULT_CUSTOMS_TAX_RATE,
    salesTaxPct: books.salesTaxPct,
  });
  if (!network) return out;
  const hasIdle = new Map(
    built.map((row) => [row.planetId, colonyPlan(row.advice, pi).idle !== null])
  );
  const byHost = new Map<number, NetworkOpportunity[]>();
  for (const opportunity of network.plan.opportunities) {
    const group = byHost.get(opportunity.hostPlanetId) ?? [];
    group.push(opportunity);
    byHost.set(opportunity.hostPlanetId, group);
  }
  const systemOf = new Map(built.map((row) => [row.planetId, row.systemId]));
  const opportunities = [...byHost.values()].flatMap((group) =>
    dropSharedSurplus(dropOtherSystemSurplus(group, systemOf))
  );
  for (const opportunity of opportunities) {
    const gain = opportunity.marginPerHour * HOURS_PER_DAY;
    if (!(gain > 0)) continue;
    const wins = out.get(opportunity.hostPlanetId) ?? [];
    wins.push(
      quickWin(
        opportunity.hostPlanetId,
        {
          kind: 'spare-room',
          what: 'factories',
          productTypeId: opportunity.typeId,
          factories: opportunity.factories,
          source: 'network',
          routedFrom: [
            ...new Set(
              opportunity.inputs.flatMap((input) =>
                input.source === 'routed' && input.fromPlanetId !== null ? [input.fromPlanetId] : []
              )
            ),
          ].sort((a, b) => a - b),
          needsRemoval: hasIdle.get(opportunity.hostPlanetId) ?? false,
        },
        gain
      )
    );
    out.set(opportunity.hostPlanetId, wins);
  }
  return out;
}
