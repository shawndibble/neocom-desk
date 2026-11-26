import type { PlanetType } from '@/engine/pi/goalTypes';
import type { ChainEstimateView } from '../chainEstimateModel';
import { DAYS_PER_WEEK } from '../findBestHowTo';
import type { NamedItem } from '../planView';
import type { MapFacility, MapGraph, ProductFigure, Trace } from './mapModel';

export interface ProductDetailInput {
  graph: MapGraph;
  typeId: number;
  trace: Trace;
  figure: ProductFigure;
  colonies: readonly { name: string; sells: readonly number[] }[];
  ccLevel: number | null;
}

export type ProductMoney =
  | {
      kind: 'one-planet';
      m3PerWeek: number;
      ccLevel: number | null;
    }
  | { kind: 'raw' }
  | { kind: 'multi-planet'; planets: number; estimate: ChainEstimateView | null }
  | { kind: 'unpriced' }
  | { kind: 'no-fit' };

export interface ProductDetailView {
  facility: MapFacility;
  inputs: NamedItem[];
  hosts: PlanetType[];
  money: ProductMoney;
  ownInputs: (NamedItem & { colonies: string[] })[];
  makingIt: string[];
}

export function buildProductDetail(input: ProductDetailInput): ProductDetailView {
  const { graph, typeId, trace, figure } = input;
  const product = graph.byId.get(typeId)!;
  const onePlanet = product.tier === 0 || trace.alternatives.length > 0;
  const planets = onePlanet ? 1 : trace.planets.length;
  const named = (id: number): NamedItem => ({ typeId: id, name: graph.byId.get(id)!.name });

  const sellers = (id: number) =>
    input.colonies.filter((colony) => colony.sells.includes(id)).map((colony) => colony.name);
  const ownInputs = [...trace.ids]
    .filter((id) => id !== typeId)
    .map((id) => graph.byId.get(id)!)
    .sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name))
    .map((item) => ({ ...named(item.typeId), colonies: sellers(item.typeId) }))
    .filter((item) => item.colonies.length > 0);

  return {
    facility: product.facility,
    inputs: product.inputs.map(named),
    hosts: product.hosts,
    money: moneyOf(product.tier, figure, planets, input.ccLevel),
    ownInputs,
    makingIt: sellers(typeId),
  };
}

function moneyOf(
  tier: number,
  figure: ProductFigure,
  planets: number,
  ccLevel: number | null
): ProductMoney {
  if (tier === 0) return { kind: 'raw' };
  if (figure.kind === 'ranked') {
    return {
      kind: 'one-planet',
      m3PerWeek: figure.m3PerDay * DAYS_PER_WEEK,
      ccLevel: figure.needsCcLevel ?? ccLevel,
    };
  }
  if (figure.reason === 'unpriced') return { kind: 'unpriced' };
  if (figure.reason === 'no-fit') return { kind: 'no-fit' };
  return { kind: 'multi-planet', planets, estimate: figure.chain ?? null };
}
