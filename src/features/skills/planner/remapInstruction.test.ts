import { describe, it, expect } from 'vitest';
import type { Attributes } from '@/engine/types';
import { attributeShort, remapInstruction } from './remapInstruction';

const BASE: Attributes = {
  intelligence: 17,
  memory: 17,
  perception: 27,
  willpower: 21,
  charisma: 17,
};

describe('attributeShort', () => {
  it('uppercases the first three letters', () => {
    expect(attributeShort('perception')).toBe('PER');
    expect(attributeShort('intelligence')).toBe('INT');
  });
});

describe('remapInstruction', () => {
  it('lists every attribute, highest value first', () => {
    expect(remapInstruction(BASE)).toBe('PER 27 / WIL 21 / INT 17 / MEM 17 / CHA 17');
  });

  it('adds implant bonuses, so the line matches the in-game remap screen', () => {
    expect(remapInstruction(BASE, { perception: 4, willpower: 4, intelligence: 4 })).toBe(
      'PER 31 / WIL 25 / INT 21 / MEM 17 / CHA 17'
    );
  });

  it('treats an empty slot as +0', () => {
    expect(remapInstruction(BASE, { memory: 5 })).toBe(
      'PER 27 / MEM 22 / WIL 21 / INT 17 / CHA 17'
    );
  });

  it('orders by the implanted value, not the base allocation', () => {
    expect(remapInstruction(BASE, { intelligence: 5 })).toBe(
      'PER 27 / INT 22 / WIL 21 / MEM 17 / CHA 17'
    );
  });
});
