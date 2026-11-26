import type { BaselineTotal } from './baseline';
import { CUSTOMS_TAXABLE_VALUE, IMPORT_TAXABLE_FRACTION } from './chain';
import type { GoalPlan, PlannerColony, PriceBooks } from './goalTypes';
import { DAY_MS, HOUR_MS } from '@/lib/age';

export type PlanEconomics =
  | {
      status: 'costed';
      revenue: number;
      buys: number;
      customs: {
        exportFromExtractors: number;
        importToHost: number;
        exportFromHost: number;
      };
      salesTax: number;
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
  books: PriceBooks,
  salesCapPerDay?: ReadonlyMap<number, number>
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
  const sellable = new Map<number, number>();
  for (const [typeId, perDay] of salesCapPerDay ?? [])
    sellable.set(typeId, perDay / (DAY_MS / HOUR_MS));
  let revenue = 0;
  let buys = 0;
  const customs = { exportFromExtractors: 0, importToHost: 0, exportFromHost: 0 };
  const planIsk = new Map<number, number>(colonies.map((c) => [c.planetId, 0]));
  const credit = (id: number, isk: number) => planIsk.set(id, (planIsk.get(id) ?? 0) + isk);

  for (const f of plan.flows) {
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
      const room = sellable.get(f.typeId);
      const sold = room === undefined ? f.unitsPerHour : Math.min(f.unitsPerHour, room);
      if (room !== undefined) sellable.set(f.typeId, room - sold);
      const sale = sold * finite(books.bid, f.typeId)!;
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
