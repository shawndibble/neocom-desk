/**
 * A Goal Plan's ISK ledger, measured against the **Baseline** — so the number
 * the pilot reads is the **Lift**: what the plan earns over leaving every
 * colony selling its own best P1.
 *
 * ## Priced per leg, from the plan's own flows
 *
 * `GoalPlan.flows` is every leg goods move on, and this module prices legs
 * rather than re-deriving where anything went:
 *
 * - leaving a colony: export customs at **that colony's** rate × the tier's
 *   `CUSTOMS_TAXABLE_VALUE` — extractors and host each pay their own;
 * - arriving at a colony (only ever the host): import customs at the host's
 *   rate × value × `IMPORT_TAXABLE_FRACTION`;
 * - a colony to itself (the host's own P1 feeding its own factories): nothing
 *   — the classic P0 → P2 planet never pays customs on its P1;
 * - arriving at the hub: a sale at the **bid**, with sales tax on it;
 * - leaving the hub: a purchase at the **ask**.
 *
 * A goal is valued as if sold at the bid, whether the pilot sells it or uses
 * it: that is what holding it is worth, and it is the same basis the Baseline
 * prices P1 on, so the two are comparable. A goal bought outright
 * (`'hub'` → `'hub'`) is a purchase at the ask and a sale at the bid — it
 * loses the spread and the tax, which is the honest answer.
 *
 * ## Lift counts every enabled colony
 *
 * `liftPerHour = netPerHour − baseline.iskPerHour`, the Baseline summed over
 * **all** enabled colonies. A colony the plan does not need keeps selling its
 * Baseline (its flows are in the plan), so it nets out of the Lift exactly;
 * what a colony the plan re-targets or makes the host gives up is part of the
 * plan's cost. A plan that only repackages the Baseline nets a Lift of zero
 * by construction. `customs.exportFromHost` is everything leaving the host,
 * its spare-slot P1 included.
 *
 * `perColony` says where the ISK lands, not who deserves it: an extractor is
 * credited its hub-bound sales less its own export customs (P1 it ships to
 * the host earns it nothing here), and the host its product sales less its
 * customs both ways and the goods bought onto it. A goal bought outright
 * lands on no colony, so `perColony` need not sum to `netPerHour`.
 *
 * ## Refusals, not zeros
 *
 * Any sale without a bid, purchase without an ask, or a Baseline still
 * missing prices is `needs-price` with every missing typeId — a Lift over a
 * partial Baseline would be a confident wrong number.
 *
 * Pure: plan, colonies, Baseline and prices are parameters. No `PiData`:
 * every flow already carries its tier, which is all customs needs.
 */

import type { BaselineTotal } from './baseline';
import { CUSTOMS_TAXABLE_VALUE, IMPORT_TAXABLE_FRACTION } from './chain';
import type { GoalPlan, PlannerColony, PriceBooks } from './goalTypes';

export type PlanEconomics =
  | {
      status: 'costed';
      /** ISK/h of hub-bound sales at the bid, before sales tax. */
      revenue: number;
      /** ISK/h spent at the ask. */
      buys: number;
      customs: {
        exportFromExtractors: number;
        importToHost: number;
        exportFromHost: number;
      };
      salesTax: number;
      /** `revenue − salesTax − buys − customs`. */
      netPerHour: number;
      baselinePerHour: number;
      liftPerHour: number;
      perColony: Map<number, { planIskPerHour: number; baselineIskPerHour: number }>;
    }
  | { status: 'needs-price'; missing: number[] };

function finite(book: Readonly<Record<number, number>>, typeId: number): number | undefined {
  const price = book[typeId];
  return price !== undefined && Number.isFinite(price) ? price : undefined;
}

export function planEconomics(
  plan: GoalPlan,
  colonies: readonly PlannerColony[],
  baseline: BaselineTotal,
  books: PriceBooks
): PlanEconomics {
  const byId = new Map(colonies.map((c) => [c.planetId, c]));
  const colonyOf = (id: number) => {
    const c = byId.get(id);
    if (!c)
      throw new Error(
        `the plan routes goods through planet ${id}, which is not among the colonies`
      );
    return c;
  };
  const hostId = plan.factoryHost?.planetId ?? null;

  const missing = new Set<number>(baseline.missing);
  for (const f of plan.flows) {
    if (f.to === 'hub' && finite(books.bid, f.typeId) === undefined) missing.add(f.typeId);
    if (f.from === 'hub' && finite(books.ask, f.typeId) === undefined) missing.add(f.typeId);
  }
  if (missing.size > 0)
    return { status: 'needs-price', missing: [...missing].sort((a, b) => a - b) };

  const salesTaxFraction = books.salesTaxPct / 100;
  let revenue = 0;
  let buys = 0;
  const customs = { exportFromExtractors: 0, importToHost: 0, exportFromHost: 0 };
  const planIsk = new Map<number, number>(colonies.map((c) => [c.planetId, 0]));
  const credit = (id: number, isk: number) => planIsk.set(id, (planIsk.get(id) ?? 0) + isk);

  for (const f of plan.flows) {
    // The host feeding itself: no customs office is crossed, nothing to price.
    if (f.from !== 'hub' && f.from === f.to) continue;
    const value = CUSTOMS_TAXABLE_VALUE[f.tier];
    if (f.from !== 'hub') {
      const tax = f.unitsPerHour * colonyOf(f.from).taxRate * value;
      if (f.from === hostId) customs.exportFromHost += tax;
      else customs.exportFromExtractors += tax;
      credit(f.from, -tax);
    }
    if (f.to !== 'hub') {
      const tax = f.unitsPerHour * colonyOf(f.to).taxRate * value * IMPORT_TAXABLE_FRACTION;
      customs.importToHost += tax;
      credit(f.to, -tax);
    }
    if (f.to === 'hub') {
      const sale = f.unitsPerHour * finite(books.bid, f.typeId)!;
      revenue += sale;
      if (f.from !== 'hub') credit(f.from, sale * (1 - salesTaxFraction));
    }
    if (f.from === 'hub') {
      const purchase = f.unitsPerHour * finite(books.ask, f.typeId)!;
      buys += purchase;
      if (f.to !== 'hub') credit(f.to, -purchase);
    }
  }

  const salesTax = revenue * salesTaxFraction;
  const netPerHour =
    revenue -
    salesTax -
    buys -
    customs.exportFromExtractors -
    customs.importToHost -
    customs.exportFromHost;

  const perColony = new Map<number, { planIskPerHour: number; baselineIskPerHour: number }>();
  for (const c of [...colonies].sort((a, b) => a.planetId - b.planetId)) {
    const own = baseline.perColony.get(c.planetId);
    perColony.set(c.planetId, {
      planIskPerHour: planIsk.get(c.planetId) ?? 0,
      baselineIskPerHour: own?.status === 'ok' ? own.iskPerHour : 0,
    });
  }

  return {
    status: 'costed',
    revenue,
    buys,
    customs,
    salesTax,
    netPerHour,
    baselinePerHour: baseline.iskPerHour,
    liftPerHour: netPerHour - baseline.iskPerHour,
    perColony,
  };
}
