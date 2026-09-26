/**
 * "Affected by": what changed one fitted item's attributes, and by how much —
 * the engine's own per-attribute modifier list (`calculate(fit, { sources:
 * true })`), with each source resolved from an index into the fit to the
 * type it is. Only published attributes (positive ids) a source touched are
 * listed; the patched, derived ones (negative ids) are this app's reading of
 * the others, not modifiers in the game. Pure.
 */

/** A modifier source as the engine reports it (`Source` in its types). */
export interface SourceLike {
  from:
    | { type: 'ship' }
    | { type: 'mode' }
    | { type: 'character' }
    | { type: 'item'; index: number }
    | { type: 'charge'; index: number }
    | { type: 'skill'; type_id: number }
    | { type: 'projected'; index: number }
    | { type: 'buff'; id: number };
  effect_id: number | undefined;
  source_attribute_id: number | undefined;
  operator: string;
  value: number;
  quantity: number;
  penalty: number | undefined;
  applied: boolean;
}

export interface AttributeWithSources {
  base: number;
  value: number;
  sources?: SourceLike[];
}

/** What the source indices point at in the calculated fit. */
export interface AffectedByContext {
  shipTypeId: number;
  modeTypeId?: number;
  /** Index-parallel to the fit's items. */
  itemTypeIds: readonly number[];
  /** The charge loaded in each item, index-parallel. */
  chargeTypeIds: readonly (number | undefined)[];
  /** Index-parallel to the fit's incoming effects. */
  projectedTypeIds: readonly number[];
}

export type AffectedSourceKind = SourceLike['from']['type'];

export interface AffectedSource {
  kind: AffectedSourceKind;
  /** The type it is — a skill, module, charge, ship…; null for the character or a buff. */
  typeId: number | null;
  /** A command burst's buff id. */
  buffId?: number;
  operator: string;
  value: number;
  /** The stacking penalty applied (0–1), null when not penalised. */
  penalty: number | null;
  /** False when the source's state is too low for its effect. */
  applied: boolean;
}

export interface AffectedAttribute {
  attributeId: number;
  base: number;
  value: number;
  sources: AffectedSource[];
}

function resolve(
  from: SourceLike['from'],
  context: AffectedByContext
): Pick<AffectedSource, 'typeId' | 'buffId'> {
  switch (from.type) {
    case 'ship':
      return { typeId: context.shipTypeId };
    case 'mode':
      return { typeId: context.modeTypeId ?? null };
    case 'character':
      return { typeId: null };
    case 'item':
      return { typeId: context.itemTypeIds[from.index] ?? null };
    case 'charge':
      return { typeId: context.chargeTypeIds[from.index] ?? null };
    case 'skill':
      return { typeId: from.type_id };
    case 'projected':
      return { typeId: context.projectedTypeIds[from.index] ?? null };
    case 'buff':
      return { typeId: null, buffId: from.id };
  }
}

export function affectedAttributes(
  attributes: ReadonlyMap<number, AttributeWithSources>,
  context: AffectedByContext
): AffectedAttribute[] {
  const rows: AffectedAttribute[] = [];
  for (const [attributeId, attribute] of attributes) {
    if (attributeId <= 0) continue;
    const sources = attribute.sources ?? [];
    if (sources.length === 0) continue;
    rows.push({
      attributeId,
      base: attribute.base,
      value: attribute.value,
      sources: sources.map((source) => ({
        kind: source.from.type,
        ...resolve(source.from, context),
        operator: source.operator,
        value: source.value,
        penalty: source.penalty ?? null,
        applied: source.applied,
      })),
    });
  }
  return rows.sort((a, b) => a.attributeId - b.attributeId);
}
