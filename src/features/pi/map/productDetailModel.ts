/**
 * What the PI product detail says about one product: how to make it (inputs,
 * the factory, the planet types, whether one planet is enough) and why or why
 * not (the model's one-planet figure, its hauling load, what the pilot's
 * colonies already make). Pure over the Map's graph, trace and figure; it
 * prices nothing.
 */
import type { PlanetType } from '@/engine/pi/goalTypes';
import { DAYS_PER_WEEK } from '../findBestHowTo';
import type { NamedItem } from '../planView';
import type { MapFacility, MapGraph, ProductFigure, Trace } from './mapModel';

export interface ProductDetailInput {
  graph: MapGraph;
  typeId: number;
  trace: Trace;
  figure: ProductFigure;
  /** The pilot's colonies and what each sells today. */
  colonies: readonly { name: string; sells: readonly number[] }[];
  /** The Command Center level the one-planet figures assume, unless the figure is tagged higher. */
  ccLevel: number | null;
}

export type ProductMoney =
  /** A ranked one-planet recipe: the figure's hauling load and the CC level it assumes. */
  | {
      kind: 'one-planet';
      /** m³ a week to haul: the hauling load. */
      m3PerWeek: number;
      ccLevel: number | null;
    }
  /** A raw material: extracted and shipped up a chain, not ranked on its own. */
  | { kind: 'raw' }
  /** Not a ranked one-planet recipe (a P3 or P4, or no one host): no figure, and why. */
  | { kind: 'multi-planet'; planets: number }
  /** The sell market has no price: unknown, never zero. */
  | { kind: 'unpriced' }
  /** One planet could make it, but no colony layout fits it. */
  | { kind: 'no-fit' };

export interface ProductDetailView {
  facility: MapFacility;
  /** Direct inputs, none for a raw material. */
  inputs: NamedItem[];
  /** Planet types that yield it (raw) or carry its factory (made). */
  hosts: PlanetType[];
  money: ProductMoney;
  /** Items anywhere under it that a colony already sells, tier then name. */
  ownInputs: (NamedItem & { colonies: string[] })[];
  /** Colonies that already sell the product itself. */
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
      // A tagged setup's figure is scored at the level its tag names.
      ccLevel: figure.needsCcLevel ?? ccLevel,
    };
  }
  if (figure.reason === 'unpriced') return { kind: 'unpriced' };
  if (figure.reason === 'no-fit') return { kind: 'no-fit' };
  return { kind: 'multi-planet', planets };
}
