/**
 * What the PI product detail says about one product: how to make it (inputs,
 * the factory, the planet types, whether one planet is enough) and why or why
 * not (the model's one-planet figure, its hauling load, what the pilot's
 * colonies already make). Pure over the Map's graph, trace and figure: nothing
 * here prices anything, so every ISK figure is the one Plan shows.
 */
import type { PlanetType } from '@/engine/pi/goalTypes';
import type { PiFactoryKind } from '@/sde/types';
import type { MapGraph, MapTier, ProductFigure, Trace } from './mapModel';

export interface ProductDetailInput {
  graph: MapGraph;
  typeId: number;
  trace: Trace;
  figure: ProductFigure;
  /** The pilot's colonies and what each sells today. */
  colonies: readonly { name: string; sells: readonly number[] }[];
  /** The Command Center level the one-planet figures assume. */
  ccLevel: number | null;
}

export interface NamedId {
  typeId: number;
  name: string;
}

export type ProductMoney =
  /** The model's one-planet figure: an estimate, from one planet of `useType`. */
  | {
      kind: 'one-planet';
      iskPerDay: number;
      useType: PlanetType;
      m3PerDay: number;
      ccLevel: number | null;
    }
  /** A raw material: extracted and shipped up a chain, not ranked on its own. */
  | { kind: 'raw' }
  /** Needs goods from several planets: no one-planet figure. */
  | { kind: 'multi-planet'; planets: number }
  /** The sell market has no price: unknown, never zero. */
  | { kind: 'unpriced' }
  /** One planet could make it, but no colony layout fits it. */
  | { kind: 'no-fit' };

export interface ProductDetailView {
  tier: MapTier;
  /** An extractor pulls a raw material; anything else runs in this factory. */
  facility: 'extractor' | PiFactoryKind;
  /** Direct inputs, none for a raw material. */
  inputs: NamedId[];
  /** Planet types that yield it (raw) or carry its factory (made). */
  hosts: PlanetType[];
  /** Planets it takes between them. */
  planets: number;
  onePlanet: boolean;
  money: ProductMoney;
  /** Items anywhere under it that a colony already sells, tier then name. */
  ownInputs: (NamedId & { colonies: string[] })[];
  /** Colonies that already sell the product itself. */
  makingIt: string[];
}

export function buildProductDetail(input: ProductDetailInput): ProductDetailView {
  const { graph, typeId, trace, figure } = input;
  const product = graph.byId.get(typeId)!;
  const onePlanet = product.tier === 0 || trace.alternatives.length > 0;
  const planets = onePlanet ? 1 : trace.planets.length;
  const named = (id: number): NamedId => ({ typeId: id, name: graph.byId.get(id)!.name });

  const sellers = (id: number) =>
    input.colonies.filter((colony) => colony.sells.includes(id)).map((colony) => colony.name);
  const ownInputs = [...trace.ids]
    .filter((id) => id !== typeId)
    .map((id) => graph.byId.get(id)!)
    .sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name))
    .map((item) => ({ ...named(item.typeId), colonies: sellers(item.typeId) }))
    .filter((item) => item.colonies.length > 0);

  return {
    tier: product.tier,
    facility: product.facility,
    inputs: product.inputs.map(named),
    hosts: product.hosts,
    planets,
    onePlanet,
    money: moneyOf(product.tier, figure, planets, input.ccLevel),
    ownInputs,
    makingIt: sellers(typeId),
  };
}

function moneyOf(
  tier: MapTier,
  figure: ProductFigure,
  planets: number,
  ccLevel: number | null
): ProductMoney {
  if (tier === 0) return { kind: 'raw' };
  if (figure.kind === 'ranked') {
    return {
      kind: 'one-planet',
      iskPerDay: figure.iskPerDay,
      useType: figure.useType,
      m3PerDay: figure.m3PerDay,
      ccLevel,
    };
  }
  if (figure.reason === 'unpriced') return { kind: 'unpriced' };
  if (figure.reason === 'no-fit') return { kind: 'no-fit' };
  return { kind: 'multi-planet', planets };
}
