/**
 * EVE's legal attribute space, and how to get back to it from a sheet that
 * has been inflated by a cerebral accelerator.
 *
 * `GET /characters/{id}/attributes` reports *effective* values: base + remap,
 * plus every modifier currently on the character. `skillMap.toAttributeBaseline`
 * already subtracts fitted implants (commit c2d8a7a). It did not subtract an
 * accelerator, because nothing in ESI says one is running — and the result was
 * a "base" sheet outside anything a remap can reach:
 *
 *     base 17/26/22/17/17          =  99   legal
 *     + implants MEM+4 PER+4 CHA+2 = 109
 *     + accelerator +12 x 5        = 169   <- what ESI reports
 *     - implants                   = 159   <- what the engine costed against
 *
 * 159 against a 99-point budget makes the character's own attributes faster
 * than every allocation `bestAttributes` can search, so `placeRemaps` keeps
 * them and reports zero savings. That is its documented contract ("never
 * slower than not remapping at all"), so the engine cannot detect the problem
 * — by the time it sees the sheet the information that would explain it is
 * gone. The check belongs here, at the point the baseline is derived.
 *
 * The decomposition is arithmetic, not a lookup of known boosters: a cerebral
 * accelerator adds the SAME bonus to all five attributes, and base + remap
 * always totals exactly `BASE_ATTRIBUTE_TOTAL`, so an inflated sheet gives the
 * bonus directly as `(total - 99) / 5`. That covers every accelerator tier CCP
 * has shipped or will ship, at the cost of assuming the bonus is uniform —
 * which is why the result is accepted only when it verifies: a whole positive
 * bonus AND all five attributes back inside 17..27. A sheet that fails either
 * test is reported as `impossible` and carries no attributes at all. There is
 * deliberately no third branch that approximates one: a baseline that merely
 * looks plausible is what caused the silent zero in the first place, and a
 * cleverer wrong answer would be worse, because it would look right.
 */
import type { AttributeName, Attributes } from '@/engine/types';

/** Lowest an attribute can be, even fully un-remapped away from. */
export const BASE_ATTRIBUTE_MIN = 17;
/** Highest an attribute can be remapped to (17 floor + all 10 a slot can take). */
export const BASE_ATTRIBUTE_MAX = 27;
/** 5 x 17 floor + 14 freely allocatable points. Every legal sheet totals this. */
export const BASE_ATTRIBUTE_TOTAL = 99;

const NAMES: readonly AttributeName[] = [
  'intelligence',
  'memory',
  'perception',
  'willpower',
  'charisma',
];

/**
 * What a character's base sheet turned out to be, and why.
 *
 * A discriminated union rather than an `Attributes` plus flags, so a caller
 * cannot read attributes off a sheet that does not have any.
 */
export type AttributeBaseline =
  /** Already a reachable allocation. The ordinary case: no accelerator, nothing to say. */
  | { kind: 'legal'; attributes: Attributes }
  /** Inflated by a uniform accelerator, which backing it out explains exactly. */
  | { kind: 'accelerated'; attributes: Attributes; acceleratorBonus: number }
  /** Not a legal allocation and not explained by one accelerator. No baseline to give. */
  | { kind: 'impossible'; reported: Attributes; reportedTotal: number };

function sum(attributes: Attributes): number {
  return NAMES.reduce((total, name) => total + attributes[name], 0);
}

function inRange(attributes: Attributes): boolean {
  return NAMES.every(
    (name) => attributes[name] >= BASE_ATTRIBUTE_MIN && attributes[name] <= BASE_ATTRIBUTE_MAX
  );
}

function copy(attributes: Attributes): Attributes {
  return {
    intelligence: attributes.intelligence,
    memory: attributes.memory,
    perception: attributes.perception,
    willpower: attributes.willpower,
    charisma: attributes.charisma,
  };
}

function minus(attributes: Attributes, bonus: number): Attributes {
  return {
    intelligence: attributes.intelligence - bonus,
    memory: attributes.memory - bonus,
    perception: attributes.perception - bonus,
    willpower: attributes.willpower - bonus,
    charisma: attributes.charisma - bonus,
  };
}

/**
 * True when this is an allocation a character can actually hold: every value
 * in 17..27, totalling exactly 99. The same space `bestAttributes` searches —
 * anything outside it beats every candidate the optimizer can offer.
 */
export function isLegalAttributeSheet(attributes: Attributes): boolean {
  return sum(attributes) === BASE_ATTRIBUTE_TOTAL && inRange(attributes);
}

/** The base sheet, or `null` when there isn't one to give. */
export function baselineAttributes(baseline: AttributeBaseline): Attributes | null {
  return baseline.kind === 'impossible' ? null : baseline.attributes;
}

/**
 * Classify an implant-free attribute sheet, recovering a uniform cerebral
 * accelerator when one explains why it is over budget.
 */
export function deriveAttributeBaseline(reported: Attributes): AttributeBaseline {
  const reportedTotal = sum(reported);
  if (isLegalAttributeSheet(reported)) return { kind: 'legal', attributes: copy(reported) };

  const acceleratorBonus = (reportedTotal - BASE_ATTRIBUTE_TOTAL) / NAMES.length;
  if (Number.isInteger(acceleratorBonus) && acceleratorBonus > 0) {
    const attributes = minus(reported, acceleratorBonus);
    // The total is 99 by construction; the range is the part that can still
    // fail, and does whenever the inflation was not one uniform bonus.
    if (inRange(attributes)) return { kind: 'accelerated', attributes, acceleratorBonus };
  }

  return { kind: 'impossible', reported: copy(reported), reportedTotal };
}
