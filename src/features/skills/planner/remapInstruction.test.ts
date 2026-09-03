import { describe, it, expect } from 'vitest';
import type { Attributes } from '@/engine/types';
import { attributeShort, remapInstruction } from './remapInstruction';

describe('attributeShort', () => {
  it('uppercases the first three letters', () => {
    expect(attributeShort('perception')).toBe('PER');
    expect(attributeShort('intelligence')).toBe('INT');
  });
});

describe('remapInstruction', () => {
  it('lists every attribute, highest value first', () => {
    const attributes: Attributes = {
      intelligence: 17,
      memory: 17,
      perception: 27,
      willpower: 21,
      charisma: 17,
    };
    expect(remapInstruction(attributes)).toBe('PER 27 / WIL 21 / INT 17 / MEM 17 / CHA 17');
  });
});
