import { describe, it, expect } from 'vitest';
import {
  BASE_ATTRIBUTE_MAX,
  BASE_ATTRIBUTE_MIN,
  BASE_ATTRIBUTE_TOTAL,
  baselineAttributes,
  deriveAttributeBaseline,
  isLegalAttributeSheet,
} from './attributeBaseline';
import type { Attributes } from './types';

const sheet = (
  intelligence: number,
  memory: number,
  perception: number,
  willpower: number,
  charisma: number
): Attributes => ({ intelligence, memory, perception, willpower, charisma });

/** Add the same bonus to every attribute, the way a cerebral accelerator does. */
const boostedBy = (base: Attributes, bonus: number): Attributes =>
  sheet(
    base.intelligence + bonus,
    base.memory + bonus,
    base.perception + bonus,
    base.willpower + bonus,
    base.charisma + bonus
  );

describe('EVE attribute-space constants', () => {
  it('matches the space the optimizer searches', () => {
    expect(BASE_ATTRIBUTE_MIN).toBe(17);
    expect(BASE_ATTRIBUTE_MAX).toBe(27);
    // 5 x 17 floor + 14 freely allocatable points.
    expect(BASE_ATTRIBUTE_TOTAL).toBe(5 * BASE_ATTRIBUTE_MIN + 14);
  });
});

describe('isLegalAttributeSheet', () => {
  it('accepts a sheet summing to 99 with every value in 17..27', () => {
    expect(isLegalAttributeSheet(sheet(20, 20, 20, 20, 19))).toBe(true);
    expect(isLegalAttributeSheet(sheet(17, 26, 22, 17, 17))).toBe(true);
    expect(isLegalAttributeSheet(sheet(27, 17, 21, 17, 17))).toBe(true);
  });

  it('rejects a sheet whose total is not exactly 99', () => {
    expect(isLegalAttributeSheet(sheet(20, 20, 20, 20, 20))).toBe(false);
    expect(isLegalAttributeSheet(sheet(17, 17, 17, 17, 17))).toBe(false);
  });

  it('rejects a sheet summing to 99 with a value outside 17..27', () => {
    // Totals exactly 99, but neither 16 nor 28 is reachable in game.
    expect(isLegalAttributeSheet(sheet(16, 28, 20, 20, 15))).toBe(false);
  });
});

describe('deriveAttributeBaseline — a sheet with no accelerator', () => {
  // The normal state for every character, and the one that must stay a
  // complete no-op: same attributes back, no accelerator, nothing to report.
  it('passes a legal sheet through untouched and reports no accelerator', () => {
    const base = sheet(17, 26, 22, 17, 17);
    const result = deriveAttributeBaseline(base);
    expect(result).toEqual({ kind: 'legal', attributes: base });
  });

  it('passes the fresh-character default through untouched', () => {
    const base = sheet(20, 20, 20, 20, 19);
    expect(deriveAttributeBaseline(base)).toEqual({ kind: 'legal', attributes: base });
  });

  it('returns a copy, so a caller cannot write back into the input', () => {
    const base = sheet(20, 20, 20, 20, 19);
    const result = deriveAttributeBaseline(base);
    expect(baselineAttributes(result)).not.toBe(base);
    expect(baselineAttributes(result)).toEqual(base);
  });
});

describe('deriveAttributeBaseline — a uniform cerebral accelerator', () => {
  // The reported bug: base 17/26/22/17/17 (99) with a +12 accelerator baked in
  // by ESI reads as 29/38/34/29/29 — 159 against a 99-point budget, which no
  // legal remap can beat, so the optimizer silently reported zero savings.
  it('recovers the +12 case from the bug report', () => {
    const base = sheet(17, 26, 22, 17, 17);
    const result = deriveAttributeBaseline(sheet(29, 38, 34, 29, 29));
    expect(result).toEqual({ kind: 'accelerated', attributes: base, acceleratorBonus: 12 });
  });

  it.each([2, 3, 4, 8, 10, 12])(
    'recovers a +%i accelerator from any legal base',
    (bonus: number) => {
      const base = sheet(17, 26, 22, 17, 17);
      expect(deriveAttributeBaseline(boostedBy(base, bonus))).toEqual({
        kind: 'accelerated',
        attributes: base,
        acceleratorBonus: bonus,
      });
    }
  );

  it('recovers an accelerator on top of a maxed attribute', () => {
    const base = sheet(27, 17, 21, 17, 17);
    expect(deriveAttributeBaseline(boostedBy(base, 4))).toEqual({
      kind: 'accelerated',
      attributes: base,
      acceleratorBonus: 4,
    });
  });

  it('always hands back a legal sheet', () => {
    for (const bonus of [2, 3, 4, 5, 8, 10, 12]) {
      const result = deriveAttributeBaseline(boostedBy(sheet(17, 26, 22, 17, 17), bonus));
      expect(isLegalAttributeSheet(baselineAttributes(result)!)).toBe(true);
    }
  });
});

describe('deriveAttributeBaseline — a sheet it cannot explain', () => {
  // No approximated third answer: a baseline that merely looks plausible is
  // what produced this bug, so an unexplainable sheet reports itself instead.
  it('reports a total that is not 99 plus a whole multiple of 5', () => {
    const result = deriveAttributeBaseline(sheet(29, 38, 34, 29, 30));
    expect(result).toEqual({
      kind: 'impossible',
      reported: sheet(29, 38, 34, 29, 30),
      reportedTotal: 160,
    });
    expect(baselineAttributes(result)).toBeNull();
  });

  it('reports a total below 99 (implants over-subtracted, not a booster)', () => {
    const result = deriveAttributeBaseline(sheet(12, 26, 22, 17, 17));
    expect(result.kind).toBe('impossible');
    expect(baselineAttributes(result)).toBeNull();
  });

  it('refuses a decomposition that would push an attribute outside 17..27', () => {
    // Totals 159 like the +12 case, so the division is clean — but backing
    // +12 out gives 28/28/28/8/7, which is not an allocation anyone can hold.
    const result = deriveAttributeBaseline(sheet(40, 40, 40, 20, 19));
    expect(result.kind).toBe('impossible');
    expect(baselineAttributes(result)).toBeNull();
  });

  it('refuses a sheet summing to 99 with an unreachable value', () => {
    const result = deriveAttributeBaseline(sheet(16, 28, 20, 20, 15));
    expect(result.kind).toBe('impossible');
  });
});
