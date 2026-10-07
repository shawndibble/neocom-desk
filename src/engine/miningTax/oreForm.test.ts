import { describe, expect, it } from 'vitest';
import { oreFormTypeId } from './oreForm';

const COMPRESSED = { '45490': 62463 };

describe('oreFormTypeId', () => {
  it('maps to the Compressed type when on and one exists', () => {
    expect(oreFormTypeId(45490, COMPRESSED, true)).toBe(62463);
  });

  it('keeps the raw type when off', () => {
    expect(oreFormTypeId(45490, COMPRESSED, false)).toBe(45490);
  });

  it('keeps the raw type when it has no Compressed counterpart', () => {
    expect(oreFormTypeId(1230, COMPRESSED, true)).toBe(1230);
  });
});
