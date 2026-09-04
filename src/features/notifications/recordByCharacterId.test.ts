import { describe, it, expect } from 'vitest';
import { recordByCharacterId } from './recordByCharacterId';

function isEvenNumber(raw: unknown): raw is number {
  return typeof raw === 'number' && raw % 2 === 0;
}

describe('recordByCharacterId', () => {
  const isRecord = recordByCharacterId(isEvenNumber);

  it('accepts a record whose keys are numeric strings and whose values all pass isValue', () => {
    expect(isRecord({ 1: 2, 42: 100 })).toBe(true);
  });

  it('accepts an empty record', () => {
    expect(isRecord({})).toBe(true);
  });

  it('rejects a value that fails isValue', () => {
    expect(isRecord({ 1: 3 })).toBe(false);
  });

  it('rejects a non-numeric key', () => {
    expect(isRecord({ abc: 2 })).toBe(false);
  });

  it('rejects null, an array, and a non-object', () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord([2, 4])).toBe(false);
    expect(isRecord('nope')).toBe(false);
  });
});
