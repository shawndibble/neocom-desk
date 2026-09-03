/**
 * Some of EVE's dogma "units" are not units at all — they say how to read the
 * value rather than what to append to it. Two kinds, both handled here.
 *
 * **Inline legends.** `eveUnits.displayName` for a handful of attributes names
 * what each value means —
 * "1=True 0=False", "1=Male 2=Unisex 3=Female", "1=small 2=medium 3=l" — so
 * appending it the way HP or m/sec is appended produces rows that read
 * "Crystals Take Damage   1 1=True 0=False". This module recognises those
 * legends and resolves a value to its member, so the row shows the one thing
 * it means ("True"). Pure: number formatting stays in
 * `features/market/format.ts`, and callers decide what to render when there
 * is no member.
 *
 * Detection is by shape rather than by a list of unit ids, so a legend CCP
 * adds in a later SDE is handled the day the snapshot is rebuilt, without a
 * code change. `scripts/build-sde.mjs` keeps shipping the raw string — the
 * repair below wants the SDE's own text to compare against.
 *
 * **Id references.** `typeID`, `groupID` and `attributeID` say the value is an
 * id, not a measurement. This module classifies them and screens out values
 * that could not be one; `itemAttributes` does the resolving, since that is
 * where the lookups arrive.
 */

/**
 * The SDE ships the size legend cut off mid-word — literally
 * "1=small 2=medium 3=l" — for reasons upstream; the gender legend beside it
 * survives at 24 characters, so it is not a general width limit and not
 * something to reason about, just something to repair. The repair also names
 * size class 4, which the truncated string cannot show and the game
 * definitely has: capital rigs are rig size 4 and citadel missiles are charge
 * size 4, and without it every one of them renders a bare, unlabelled "4".
 * Keyed by the exact truncated string, so an SDE that one day ships the
 * legend whole misses this map and is parsed correctly on its own.
 */
const LEGEND_REPAIRS: Readonly<Record<string, string>> = {
  '1=small 2=medium 3=l': '1=small 2=medium 3=large 4=X-Large',
};

/** A legend starts a member with "<int>=" at the string start or after a space. */
const LEGEND_SHAPE = /(?:^|\s)-?\d+=/;

/** One "<int>=<member>" pair; the member runs up to the next pair or the end. */
const LEGEND_MEMBERS = /(-?\d+)=(.*?)(?=\s+-?\d+=|$)/g;

/** True when this "unit" is an inline enum legend rather than a suffix to append. */
export function isEnumUnit(unit: string | null | undefined): boolean {
  return unit != null && LEGEND_SHAPE.test(unit);
}

/**
 * The legend member `value` names — "True", "Large" — or null when `unit` is
 * a real unit, or when the value is outside the legend (charge size 4 is a
 * real XL charge the 1-3 legend never listed). Null means "no member": show
 * the bare number rather than inventing a label.
 */
export function enumUnitLabel(unit: string | null | undefined, value: number): string | null {
  if (!isEnumUnit(unit) || unit == null) return null;
  for (const [, key, member] of (LEGEND_REPAIRS[unit] ?? unit).matchAll(LEGEND_MEMBERS)) {
    if (Number(key) !== value) continue;
    const label = member.trim();
    // The SDE mixes cases across legends ("True" but "small") — one row
    // shouldn't read differently from the next because of it.
    return label ? label[0].toUpperCase() + label.slice(1) : null;
  }
  return null;
}

/** What an id-reference "unit" points at. */
export type IdReferenceKind = 'type' | 'group' | 'attribute';

/**
 * The units that are an id in disguise. `groupID` names an item **Group**
 * (`invGroups`), never a Market Group — CONTEXT.md keeps those distinct.
 */
const ID_REFERENCE_UNITS: Readonly<Record<string, IdReferenceKind>> = {
  typeID: 'type',
  groupID: 'group',
  attributeID: 'attribute',
};

/**
 * What `unit` references, or null for a real unit. Disjoint from
 * `isEnumUnit` by construction: an enum legend always carries a "<int>=",
 * which none of these three do.
 */
export function idReferenceKind(unit: string | null | undefined): IdReferenceKind | null {
  return unit == null ? null : (ID_REFERENCE_UNITS[unit] ?? null);
}

/**
 * Whether `value` could be an id at all — not whether anything can name it.
 * Dogma leaves unused reference slots at 0 and ESI sends every value as a
 * float, so neither 0, a negative, nor 1.5 is worth a lookup.
 */
export function looksLikeId(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}
