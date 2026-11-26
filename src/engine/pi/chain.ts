import type { PiData, PiSchematic } from '@/sde/types';
import type {
  ChainCostBreakdown,
  ChainCostOptions,
  ChainCostResult,
  ChainLayout,
  ChainNode,
  ExpandChainOptions,
  ExtractionPlan,
  PiChain,
  PiTier,
  SourcedLine,
  SourcingFloor,
} from './types';

export type {
  ChainCostBreakdown,
  ChainCostNeedsExtractionRate,
  ChainCostOptions,
  ChainCostResult,
  ChainInput,
  ChainLayout,
  ChainNode,
  ExpandChainOptions,
  ExtractionLine,
  ExtractionPlan,
  PiChain,
  PiTier,
  SourcedLine,
  SourcingFloor,
} from './types';

export const CUSTOMS_TAXABLE_VALUE: Readonly<Record<PiTier, number>> = {
  0: 5,
  1: 400,
  2: 7_200,
  3: 60_000,
  4: 1_200_000,
};

export const IMPORT_TAXABLE_FRACTION = 0.5;

export const DEFAULT_CUSTOMS_TAX_RATE = 0.1;

const SECONDS_PER_HOUR = 3_600;

const CEIL_EPSILON = 1e-9;

export const SOURCING_FLOOR_TIER: Readonly<Record<SourcingFloor, PiTier>> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

export function isP0(typeId: number, pi: PiData): boolean {
  return pi.raw.some((resource) => resource.typeID === typeId);
}

function schematicFor(typeId: number, pi: PiData): PiSchematic | undefined {
  return pi.schematics[String(typeId)];
}

export function piTier(typeId: number, pi: PiData, seen: ReadonlySet<number> = new Set()): PiTier {
  if (isP0(typeId, pi)) return 0;
  const schematic = schematicFor(typeId, pi);
  if (!schematic) throw new Error(`${typeId} is neither a P0 resource nor a planetary schematic`);
  if (seen.has(typeId)) throw new Error(`planetary schematic cycle at ${typeId}`);
  const next = new Set(seen).add(typeId);
  const deepest = Math.max(...schematic.inputs.map((input) => piTier(input.typeID, pi, next)));
  const tier = deepest + 1;
  if (tier > 4) throw new Error(`${typeId} resolves to P${tier}, beyond the P4 the game defines`);
  return tier as PiTier;
}

function ceilUnits(value: number): number {
  return Math.ceil(value - CEIL_EPSILON);
}

export function expandChain(typeId: number, pi: PiData, opts: ExpandChainOptions): PiChain {
  const { unitsPerHour } = opts;
  if (!Number.isFinite(unitsPerHour) || unitsPerHour <= 0) {
    throw new Error(`expandChain needs a positive target rate, got ${unitsPerHour}`);
  }

  const demand = new Map<number, number>();
  const names = new Map<number, string>();

  const walk = (id: number, perHour: number, ancestors: ReadonlySet<number>): void => {
    demand.set(id, (demand.get(id) ?? 0) + perHour);
    const schematic = schematicFor(id, pi);
    if (!schematic) return;
    if (ancestors.has(id)) throw new Error(`planetary schematic cycle at ${id}`);
    names.set(id, schematic.name);
    const next = new Set(ancestors).add(id);
    for (const input of schematic.inputs) {
      if (!names.has(input.typeID)) names.set(input.typeID, input.name);
      walk(input.typeID, (perHour * input.quantity) / schematic.quantity, next);
    }
  };
  walk(typeId, unitsPerHour, new Set());

  const nodes: ChainNode[] = [...demand].map(([id, perHour]) => {
    const schematic = schematicFor(id, pi);
    const tier = piTier(id, pi);
    if (!schematic) {
      return {
        typeId: id,
        name: names.get(id) ?? String(id),
        tier,
        unitsPerHour: perHour,
        cycleTimeSeconds: null,
        outputPerCycle: null,
        cyclesPerHour: null,
        outputPerHour: null,
        factoryPins: null,
        inputs: [],
      };
    }
    const cyclesPerHour = SECONDS_PER_HOUR / schematic.cycleTime;
    const outputPerHour = schematic.quantity * cyclesPerHour;
    return {
      typeId: id,
      name: schematic.name,
      tier,
      unitsPerHour: perHour,
      cycleTimeSeconds: schematic.cycleTime,
      outputPerCycle: schematic.quantity,
      cyclesPerHour,
      outputPerHour,
      factoryPins: ceilUnits(perHour / outputPerHour),
      inputs: schematic.inputs.map((input) => ({
        typeId: input.typeID,
        quantityPerCycle: input.quantity,
      })),
    };
  });

  nodes.sort((a, b) => b.tier - a.tier || a.typeId - b.typeId);
  return { targetTypeId: typeId, targetPerHour: unitsPerHour, nodes };
}

function planetOf(tier: PiTier, layout: ChainLayout): string {
  return layout === 'single-planet' ? 'made' : `tier-${tier}`;
}

export function chainCost(chain: PiChain, opts: ChainCostOptions): ChainCostResult {
  const {
    prices,
    revenuePrices = prices,
    sourcingFloor,
    sourcedBasis = 'buy',
    ownSourcedIds,
    layout,
    taxRate = DEFAULT_CUSTOMS_TAX_RATE,
    salesTaxPct = 0,
    extractionRate = null,
  } = opts;

  const byId = new Map(chain.nodes.map((node) => [node.typeId, node]));
  const target = byId.get(chain.targetTypeId);
  if (!target) throw new Error(`chain is missing its own target ${chain.targetTypeId}`);

  const floorTier = SOURCING_FLOOR_TIER[sourcingFloor];
  if (floorTier >= target.tier) {
    throw new Error(
      `sourcing floor ${sourcingFloor} is at or above the target's own tier P${target.tier}; there would be nothing to make`
    );
  }

  const demand = new Map<number, number>();
  const madeEdges: { parent: ChainNode; child: ChainNode; unitsPerHour: number }[] = [];

  const walk = (node: ChainNode, perHour: number): void => {
    demand.set(node.typeId, (demand.get(node.typeId) ?? 0) + perHour);
    if (node.tier <= floorTier) return;
    const outputPerCycle = node.outputPerCycle;
    if (outputPerCycle == null) return;
    for (const input of node.inputs) {
      const child = byId.get(input.typeId);
      if (!child) throw new Error(`chain is missing input ${input.typeId} of ${node.typeId}`);
      const childPerHour = (perHour * input.quantityPerCycle) / outputPerCycle;
      if (child.tier > floorTier) {
        madeEdges.push({ parent: node, child, unitsPerHour: childPerHour });
      }
      walk(child, childPerHour);
    }
  };
  walk(target, chain.targetPerHour);

  const nodeAt = (id: number): ChainNode => byId.get(id) as ChainNode;
  const sourcedIds = [...demand.keys()].filter((id) => nodeAt(id).tier <= floorTier);

  const usableRate =
    extractionRate != null && Number.isFinite(extractionRate) && extractionRate > 0
      ? extractionRate
      : null;
  if (sourcingFloor === 'P0' && usableRate == null) {
    return {
      status: 'needs-extraction-rate',
      sourcingFloor: 'P0',
      p0PerHour: sourcedIds.map((id) => ({
        typeId: id,
        name: nodeAt(id).name,
        unitsPerHour: demand.get(id) as number,
      })),
    };
  }

  const perTargetUnit = (perHour: number) => perHour / chain.targetPerHour;
  const priceIn = (book: Readonly<Record<number, number>>, id: number, label: string): number => {
    const price = book[id];
    if (price == null || !Number.isFinite(price)) {
      throw new Error(`no price for ${label} (${id}); the chain cannot be costed`);
    }
    return price;
  };
  const bookFor = (id: number) => {
    const own = ownSourcedIds ? ownSourcedIds.has(id) : sourcedBasis === 'own';
    return own ? revenuePrices : prices;
  };

  const sourced: SourcedLine[] = sourcedIds.map((id) => {
    const node = nodeAt(id);
    const unitPrice = priceIn(bookFor(id), id, node.name);
    const units = perTargetUnit(demand.get(id) as number);
    return {
      typeId: id,
      name: node.name,
      tier: node.tier,
      units,
      unitPrice,
      cost: units * unitPrice,
    };
  });
  const sourcedCost = sourced.reduce((sum, line) => sum + line.cost, 0);
  const revenue = priceIn(revenuePrices, chain.targetTypeId, target.name);

  let taxBase = 0;
  for (const line of sourced) {
    taxBase += line.units * CUSTOMS_TAXABLE_VALUE[line.tier] * IMPORT_TAXABLE_FRACTION;
  }
  taxBase +=
    perTargetUnit(demand.get(target.typeId) as number) * CUSTOMS_TAXABLE_VALUE[target.tier];
  for (const edge of madeEdges) {
    if (planetOf(edge.parent.tier, layout) === planetOf(edge.child.tier, layout)) continue;
    const units = perTargetUnit(edge.unitsPerHour);
    const value = CUSTOMS_TAXABLE_VALUE[edge.child.tier];
    taxBase += units * value + units * value * IMPORT_TAXABLE_FRACTION;
  }
  const taxCost = taxRate * taxBase;

  const madeTiers = new Set(
    [...demand.keys()].map((id) => nodeAt(id).tier).filter((tier) => tier > floorTier)
  );

  let extraction: ExtractionPlan | null = null;
  if (sourcingFloor === 'P0' && usableRate != null) {
    const byType = sourcedIds.map((id) => {
      const unitsPerHour = demand.get(id) as number;
      return {
        typeId: id,
        name: nodeAt(id).name,
        unitsPerHour,
        extractors: ceilUnits(unitsPerHour / usableRate),
      };
    });
    extraction = {
      ratePerHour: usableRate,
      totalExtractors: byType.reduce((sum, line) => sum + line.extractors, 0),
      byType,
    };
  }

  const totalCost = sourcedCost + taxCost;
  const salesTax = (revenue * salesTaxPct) / 100;
  const breakdown: ChainCostBreakdown = {
    status: 'costed',
    sourcingFloor,
    layout,
    taxRate,
    planetCount: layout === 'single-planet' ? 1 : madeTiers.size,
    sourced,
    sourcedCost,
    taxBase,
    taxCost,
    totalCost,
    revenue,
    salesTax,
    salesTaxPct,
    margin: revenue - totalCost - salesTax,
    extraction,
  };
  return breakdown;
}
