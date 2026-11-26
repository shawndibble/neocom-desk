import { ATTRIBUTE_NAMES } from '@/engine/optimizer';
import type { AttributeName, Attributes, Implants } from '@/engine/types';

export function attributeShort(name: AttributeName): string {
  return name.slice(0, 3).toUpperCase();
}

export function remapInstruction(attributes: Attributes, implants: Implants = {}): string {
  const withImplants = (name: AttributeName): number => attributes[name] + (implants[name] ?? 0);
  return [...ATTRIBUTE_NAMES]
    .sort((a, b) => withImplants(b) - withImplants(a))
    .map((name) => `${attributeShort(name)} ${withImplants(name)}`)
    .join(' / ');
}
