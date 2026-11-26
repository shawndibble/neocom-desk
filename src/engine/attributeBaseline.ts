import type { AttributeName, Attributes } from '@/engine/types';

export const BASE_ATTRIBUTE_MIN = 17;
export const BASE_ATTRIBUTE_MAX = 27;
export const BASE_ATTRIBUTE_TOTAL = 99;

const NAMES: readonly AttributeName[] = [
  'intelligence',
  'memory',
  'perception',
  'willpower',
  'charisma',
];

export type AttributeBaseline =
  | { kind: 'legal'; attributes: Attributes }
  | { kind: 'accelerated'; attributes: Attributes; acceleratorBonus: number }
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

export function isLegalAttributeSheet(attributes: Attributes): boolean {
  return sum(attributes) === BASE_ATTRIBUTE_TOTAL && inRange(attributes);
}

export function baselineAttributes(baseline: AttributeBaseline): Attributes | null {
  return baseline.kind === 'impossible' ? null : baseline.attributes;
}

export function acceleratorBonusOf(baseline: AttributeBaseline | null | undefined): number {
  return baseline?.kind === 'accelerated' ? baseline.acceleratorBonus : 0;
}

export function deriveAttributeBaseline(reported: Attributes): AttributeBaseline {
  const reportedTotal = sum(reported);
  if (isLegalAttributeSheet(reported)) return { kind: 'legal', attributes: copy(reported) };

  const acceleratorBonus = (reportedTotal - BASE_ATTRIBUTE_TOTAL) / NAMES.length;
  if (Number.isInteger(acceleratorBonus) && acceleratorBonus > 0) {
    const attributes = minus(reported, acceleratorBonus);
    if (inRange(attributes)) return { kind: 'accelerated', attributes, acceleratorBonus };
  }

  return { kind: 'impossible', reported: copy(reported), reportedTotal };
}
